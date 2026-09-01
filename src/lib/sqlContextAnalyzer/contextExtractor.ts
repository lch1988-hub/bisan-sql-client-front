/**
 * SQL 쿼리에서 테이블명, alias 추출 유틸리티  
 */

export interface AliasMapping {
    [alias: string]: string;  // alias -> 실제 테이블명 매핑
}

/**
 * FROM 절에서 테이블명과 alias 추출 (전체 쿼리 텍스트 사용)
 */
export function extractFromClause(sql: string): AliasMapping {
    const aliasToTableName: Record<string, string> = {};
    
    try {
        //FROM 절 전체 추출 (다음 키워드까지 또는 엔드)  
        const fromClauseMatch = sql.match(/FROM\s+([^;]+?)(?:\s+(?:WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b|$)/i);
        
        if (!fromClauseMatch || !fromClauseMatch[1]) {
            return aliasToTableName;
        }

        const fromContent = fromClauseMatch[1];
        
        // 콤마 단위로 분리하여 여러 테이블 처리 (JOIN 문법도 지원)  
        const commaSeparatedEntries = fromContent.split(',').filter((s: string) => s.trim());
        
        for (const entry of commaSeparatedEntries) {
            // AS 키워드 제거  
            const cleanEntry = entry.replace(/\bAS\b/gi, '').trim();
            
            if (!cleanEntry || ['join', 'left', 'right', 'inner', 'outer'].some(kw => 
                cleanEntry.toLowerCase().startsWith(kw))) {
                continue;
            }

            // 테이블명과 alias 추출: "TABLE_NAME AS ALIAS" or "TABLE_NAME ALIAS"  
            const parts = cleanEntry.split(/\s+/);
            
            if (parts.length < 1 || !parts[0]) continue;
            
            // JOIN 문법 처리: "left table_name alias"  first non-JOIN keyword is table  
            const joinKeywords = ['inner', 'left', 'right', 'outer', 'full', 'join'];
            let firstNonJoinIndex = parts.findIndex(p => 
                p.toUpperCase() !== 'AS' && !joinKeywords.includes(p.toUpperCase())
            );
            
            if (firstNonJoinIndex === -1) {
                // JOIN 키워드만 있으면 무시  
                continue;
            }
            
            // 테이블명 추출  
            let tableName = parts[firstNonJoinIndex].toUpperCase().replace(/[^A-Z0-9_]/g, '');
            
            if (!tableName) continue;
            
            // Alias 는 다음 단어 (있으면), AS 는 건너뛰기  
            let aliasPart: string | null = tableName;
            for (let i = firstNonJoinIndex + 1; i < parts.length; i++) {
                const part = parts[i].toUpperCase();
                if (part === 'AS' || joinKeywords.includes(part)) continue;
                
                aliasPart = part;
                break;
            }
            
            //  닫는 괄호 및 특수문자 제거 (서브쿼리 대응)
            if (aliasPart) {
                // "Y)" -> "Y", ")FROM" -> "" 등
                const cleanAlias = aliasPart.replace(/[)\s;,\]]+/g, '').toUpperCase();
                
                if (cleanAlias && !aliasToTableName[cleanAlias]) {
                    aliasToTableName[cleanAlias] = tableName;
                    console.log('[extractFromClause] Cleaned alias:', { raw: aliasPart, clean: cleanAlias, table: tableName });
                }
            }
        }
    } catch (e) {
        console.warn('[SQL Context Extractor] FROM 테이블/Alias 추출 실패:', e);
    }

    return aliasToTableName;
}

/**
 * 특정 쿼리에서 첫 번째 테이블명 추출  
 */
export function extractFirstTableFromQuery(queryText: string): string | null {
    const match = queryText.match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
    return match?.[1] || null;
}

/**
 * SELECT 절 이후에서 테이블/컬럼이 이미 입력되었는지 확인  
 */
export function getAlreadySelectedColumns(queryBeforeCursor: string): {
    hasSelect: boolean;
    columns: string[];
} {
    const selectMatch = queryBeforeCursor.match(/SELECT\s+(.+?)\s+FROM/i);
    
    if (!selectMatch?.[1]) {
        return { hasSelect: false, columns: [] };
    }

    const selectedText = selectMatch[1];
    
    // * 별표 처리  
    if (selectedText.includes('*')) {
        return { hasSelect: true, columns: ['*'] };
    }

    // 콤마로 분리된 컬럼 목록 추출  
    const columnNames = selectedText
        .split(',')
        .map(col => col.trim())
        .filter(col => col.length > 0 && !col.match(/\b(AS|FROM)\b/i))
        .map(col => {
            // `table.column` 또는 `alias.column` 형태에서 컬럼명만 추출  
            const parts = col.split('.');
            return parts[parts.length - 1] || col;
        });

    return { hasSelect: true, columns: columnNames };
}
