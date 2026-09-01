/**
 * SQL 쿼리 파싱 유틸리티 - node-sql-parser 사용 (불완전한 쿼리 fallback 포함)
 */

import { Parser } from 'node-sql-parser';

const parser = new Parser();

export interface ParsedColumn {
    column: string;
    table?: string;      // 테이블명이 명시된 경우
    alias?: string;      // AS(alias) 사용 여부
}

export interface SQLParseResult {
    isSuccess: boolean;                    // 파싱 성공 여부  
    ast?: any;                            // AST (성공 시)
    
    // FROM 절에서 추출된 정보
    availableTables: Array<{               // 파서로부터 얻은 테이블 목록
        name: string;                      // 실제 테이블명
        alias?: string;                    // 사용된 alias (없으면 원래 이름)
    }>;
    
    // SELECT 절에서 추출된 정보  
    selectedColumns: ParsedColumn[];       // 이미 명시된 컬럼들
    
    // 현재 파싱된 상태 분석
    hasFromClause: boolean;                // FROM 절 존재 여부
    hasWhereClause: boolean;               // WHERE 절 존재 여부  
    isComplete: boolean;                   // 쿼리가 완성되었는지 (마침표 포함)
    
    parseError?: string;                   // 에러 메시지 (실패 시)
}

/**
 * node-sql-parser 로 SQL 쿼리 파싱 시도 (불완전한 경우 gracefully fallback)
 */
export function parseSQLWithFallback(
    queryText: string,
    dialect: 'mysql' | 'postgresql' | 'mariadb' | 'sqlite' = 'mariadb'
): SQLParseResult {
    
    // 디폴트 값으로 초기화  
    const defaultResult: SQLParseResult = {
        isSuccess: false,
        availableTables: [],
        selectedColumns: [],
        hasFromClause: false,
        hasWhereClause: false,
        isComplete: queryText.trim().endsWith(';')
    };

    // 1. text-based 빠른 분석 (모든 경우에 사용)  
    const upperQuery = queryText.toUpperCase();
    
    const resultBasedOnText: SQLParseResult = {
        ...defaultResult,
        hasFromClause: /\bFROM\b/i.test(upperQuery),
        hasWhereClause: /\bWHERE\b/i.test(upperQuery)
    };

    // 2. text-based 테이블 추출 (fallback 용)
    const fromMatch = queryText.match(/\bFROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/i);
    
    if (fromMatch?.[1]) {
        resultBasedOnText.availableTables.push({
            name: fromMatch[1],
            alias: fromMatch[2] || undefined
        });
    }

    // 3. node-sql-parser 로 엄밀한 파싱 시도  
    try {
        const ast = parser.astify(queryText, { 
            database: dialect === 'mariadb' ? 'MariaDB' : dialect === 'mysql' ? 'MySQL' : 
                     dialect.charAt(0).toUpperCase() + dialect.slice(1),
            parseOptions: { includeLocations: true }
        });

        // 성공! AST 에서 상세 정보 추출
        
        // FROM 절 정보 추출  
        const tablesFromAST = new Map<string, string>(); // name -> alias mapping
        
        if ((ast as any).from && Array.isArray((ast as any).from)) {
            for (const t of (ast as any).from) {
                // JOIN 구절 처리 (multiple tables 가능)
                const tableName = t.table || t.value?.table;  
                const tableAlias = t.as || t.alias;

                if (tableName) {
                    tablesFromAST.set(tableName, tableAlias);
                } 
            }
        }

        // SELECT 절 정보 추출  
        const columnsFromAST: ParsedColumn[] = [];
        
        if ((ast as any).columns && Array.isArray((ast as any).columns)) {
            for (const col of (ast as any).columns) {
                // * 별표 표현식  
                if (col.type === 'star' || (col.expr?.type === 'star')) {
                    columnsFromAST.push({
                        column: '*',
                        table: col.table || col.expr?.table
                    });
                } 
                // 일반 컬럼 참조
                else if ((col as any).expr) {
                    const expr = (col as any).expr;
                    
                    columnsFromAST.push({
                        column: expr.column || expr.name,
                        table: expr.table,  
                        alias: col.alias
                    });
                }
                // 별표 식별자 패턴  
                else if (col.val) {
                    // `alias.col` 또는 `table.*` 패턴 처리
                    const valStr = String(col.val);
                    
                    if (valStr.includes('.')) {
                        const parts = valStr.split('.');
                        columnsFromAST.push({
                            column: parts[1] || '',
                            table: parts[0],
                            alias: col.alias
                        });
                    } else {
                        columnsFromAST.push({
                            column: valStr,
                            alias: col.alias
                        });
                    }  
                }
            }
        }

        return {
            isSuccess: true,
            ast,
            availableTables: Array.from(tablesFromAST.entries()).map(([name, alias]) => ({
                name, 
                alias: alias || undefined
            })),
            selectedColumns: columnsFromAST,
            hasFromClause: resultBasedOnText.hasFromClause,
            hasWhereClause: resultBasedOnText.hasWhereClause,  
            isComplete: true // 파싱 성공 = 쿼리가 완전함
        };

    } catch (err) {
        console.log('[SQL Parser] Parse failed - using text fallback:', (err as Error).message);
        
        return resultBasedOnText;
    }
}

/**
 * 특정 절에서 자동완성 유형 결정
 */ 
export function getSuggestionType(
    queryText: string,
    cursorOffset?: number  // 쿼리 내에서 커서 위치
): {
    type: 'TABLE' | 'COLUMN_SELECT' | 'WHERE_CONDITION' | 'CLAUSE_START';
    context?: any;
} {
    
    let fullQuery = queryText.trim();
    const upperQuery = fullQuery.toUpperCase();

    // cursorOffset 이 있으면 그 위치 기준으로 판단
    if (cursorOffset !== undefined && cursorOffset < fullQuery.length) {
        fullQuery = fullQuery.substring(0, cursorOffset).trim();
    }

    if (/SELECT\s+\z/.test(fullQuery)) {
        return { type: 'TABLE' }; // FROM 이 없으므로 테이블 선택 유도  
    }

    const hasFrom = /FROM\b/i.test(upperQuery);
    
    if (!hasFrom) {
        return { 
            type: 'TABLE',  // 아직 FROM 안 썼음  테이블명 추천
            context: { afterFrom: false, tableNames: [] }
        };
    }

    const hasWhere = /\bWHERE\b/i.test(upperQuery);
    
    if (!hasWhere) {
        return { 
            type: 'COLUMN_SELECT',  // SELECT 절에 컬럼 추가 중
            context: { afterFrom: false, whereActive: false }
        };
    }

    return {
        type: 'WHERE_CONDITION',  // WHERE 절 조건 표현식 작성 중
        context: { tableNames: [] } // 테이블 별칭 분석 (추가 로직 필요시 구현)  
    };
}

/**
 * 파싱 결과 + 메타데이터 결합하여 자동완성 제안 생성  
 */ 
export function generateSQLSuggestions(
    parseResult: SQLParseResult,
    metadataTablesColumns: Record<string, string[]>,  // { users: ['id', 'name'], products: [...] }
    includeKeywords: boolean = true
) {
    
    const monacoLanguages = (window as any).monaco.languages;
    const customSuggestions = (window as any).sqlAutoCompleteKeywords || [];
    const completions: any[] = [];

    // 키워드 포함 여부 옵션
    if (includeKeywords) {
        const sqlKeywords = [
            'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE',  
            'CREATE', 'ALTER', 'DROP', 'JOIN'
            // ... 필요한 모든 SQL 키워드 추가  
        ];

        for (const keyword of sqlKeywords) {
            completions.push({ 
                label: keyword,
                kind: monacoLanguages.CompletionItemKind.Keyword,  
                insertText: keyword.toUpperCase(),
                documentation: `SQL ${keyword}`,
                sortText: '1'  // 키워드 우선순위 높게
            });
        }
    }

    // 쿼리 컨텍스트 분석  
    const currentContext = (() => {
        let queryForAnalysis = parseResult.hasFromClause ? 'FROM_ACTIVE' : 'SELECT_ONLY'; 
        if (parseResult.hasWhereClause) {
            queryForAnalysis = 'WHERE_ACTIVE';  
        }

        // text-based 파싱 정보 우선 사용, AST 가 있으면 그것을 덮어씀
        return queryForAnalysis;
    })();

    // 컨텍스트에 따른 자동완성 로직 
    if (currentContext === 'SELECT_ONLY' || currentContext === 'TABLE') {
        // FROM 절이 아직 안 써서 테이블명 제안  
        
        for (const [tableName, columns] of Object.entries(metadataTablesColumns)) {
            completions.push({
                label: tableName,
                kind: monacoLanguages.CompletionItemKind.Table,
                insertText: tableName,  
                detail: `Table (${columns.length} columns)`,
                documentation: `${tableName} 테이블 선택`,
                sortText: '2'  // 테이블 다음 순위
            });

            // 표를 선택하면 자동으로 컬럼 제안 옵션 제공 (UX 향상)  
            if (columns.length > 0) {
                completions.push({
                    label: `${tableName}.ALL`,  
                    kind: monacoLanguages.CompletionItemKind.Snippet,
                    insertText: tableName + '.*',
                    detail:`${tableName} 의 모든 컬럼 (* 사용)`,
                    sortText: '9'  // 낮은 우선순위 (명시적 선택 유도)
                });

                for (const column of columns.slice(0, 10)) {
                    completions.push({
                        label: `${tableName}.${column}`,
                        kind: monacoLanguages.CompletionItemKind.Field,
                        insertText: column,  
                        detail: `Column from ${tableName}` 
                    });
                }  
            }
        }

    } else if (currentContext === 'FROM_ACTIVE' || currentContext === 'COLUMN_SELECT') {
        // FROM 절이 있으므로 컬럼명 제안
        
        const tablesFromQuery = parseResult.availableTables;
        
        if (tablesFromQuery.length > 0) {
            // 쿼리에 명시된 테이블의 컬럼만 우선 제시
            for (const tableInfo of tablesFromQuery) {
                const tableName = tableInfo.name;  
                const columns = metadataTablesColumns[tableName] || [];

                for (const column of columns) {
                    completions.push({
                        label: `${tableName}.${column}`,  // 테이블 접두사 포함  
                        kind: monacoLanguages.CompletionItemKind.Field,
                        insertText: column, // 접미사 없이 컬럼명만 삽입
                        detail:`${tableName} 테이블의 ${column} 컬럼`,
                        documentation: `FROM 절에 명시된 테이블 (${tableInfo.alias || tableName})`,  
                        sortText: '1'  // 높은 우선순위
                    });
                }
            }

        } else {
            // AST 에 테이블 없으면 메타데이터 전체 표에서 컬럼 제시 (fallback)
            for (const [tableName, columns] of Object.entries(metadataTablesColumns)) {
                
                for (const column of columns.slice(0, 20)) {
                    completions.push({
                        label: `${tableName}.${column}`,  
                        kind: monacoLanguages.CompletionItemKind.Field,
                        insertText: column,  
                        detail:`${tableName} 테이블의 컬럼`,
                        sortText: '3'
                    });
                }
            }
        }

    } else if (currentContext === 'WHERE_ACTIVE') {
        // WHERE 절 조건식 작성 중 - 컬럼명 + 연산자 모두 제안  
        
        const tablesFromQuery = parseResult.availableTables;
        const allColumnsMap: Set<string> = new Set();

        for (const tableInfo of tablesFromQuery) {
            const columns = metadataTablesColumns[tableInfo.name] || [];
            
            if (columns.length > 0) {
                for (const column of columns) {
                    allColumnsMap.add(tableInfo.name + '.' + column);
                    // 컬럼만 넣으면 이미 중복 처리됨
                }
            }
        }

        // WHERE 조건식 패턴에 맞는 자동완성  
        const whereOperators = ['=', '>', '<', '>=', '<=', '<>', '!=', 'LIKE', 'IN', 'IS NULL'];
        
        for (const op of whereOperators) {
            completions.push({
                label: op,
                kind: monacoLanguages.CompletionItemKind.Operator,  
                insertText: ' ' + op + ' ',  // 양쪽 공백 자동 채우기
                detail:`연산자 ${op}`
            });
        }

    } else {
        // 기본 자동완성 (FROM 이 아예 없어도 모든 표와 컬럼 보여줌 - discovery 모드)  
        
        for (const [tableName, columns] of Object.entries(metadataTablesColumns)) {
            
            completions.push({
                label: tableName,
                kind: monacoLanguages.CompletionItemKind.Table,
                insertText: tableName,
                detail:'Table',
              documentation: `${tableName} 테이블`,
                sortText: '2'
            });

            for (const column of columns.slice(0, 15)) {
                completions.push({  
                    label: column, // 선택 모드에서는 표 접두사 없이 순수 컬럼명 표시 (FROM 전에)
                    kind: monacoLanguages.CompletionItemKind.Field,  // SELECT 절에는 테이블 접미사 붙이지 않고 순수 컬럼명 우선순위로 제시  
                    insertText: column,  
                    detail:`${tableName}의 ${column}`,
                    sortText: '1'  
                });
            }  
        }

    }

    return Array.from(new Set(completions));  // 중복 제거 (Set 사용)
}

/**
 * 전체 SQL 에 있는 쿼리 수 및 각 쿼리의 상태 반환 (디버깅 용도)  
 */ 
export function analyzeMultipleQueries(sql: string): {
    queryCount: number;  
    queries: Array<{
        index: number;  
        text: string;
        isComplete: boolean;
        parseResult?: SQLParseResult;
    }>;
} {
    
    const statements = [];
    let tempQuery = '';
    let i = 0;
    const len = sql.length;

    while (i < len) {  
        if (sql[i] === ';') {
            const trimmed = tempQuery.trim();
            
            if (trimmed) {
                statements.push({ 
                    text: trimmed,  
                    isComplete: true  // ; 로 끝남  
                });
            }

            tempQuery = '';
                
        } else {
            tempQuery += sql[i];
        }
        
        i++;
    }

    if (tempQuery.trim()) {
        statements.push({  
            text: tempQuery.trim(),  
            isComplete: false  // ; 없음  
        });
    }

    return {  
        queryCount: statements.length,  
        queries: statements.map((q, idx) => ({
            index: idx + 1,  
            text: q.text,
            isComplete: q.isComplete
        }))
    };
}
