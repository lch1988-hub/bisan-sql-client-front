/**
 * SQL 자동완성 진입점 - Monaco 에디터용 메인 함수
 * 절별 분기 처리: WHERE, FROM, SELECT 로 분리된 모듈 사용
 */

import { extractFromClause } from '../sqlContextAnalyzer/contextExtractor';
import type { TableColumns, CompletionItem, MonacoPosition, MonacoWord } from './types';
import { analyzeSQLClauses, extractTableFromFROMClause, resolveAliasInWHERE, extractTableFromSelectOnly } from './parser';
import { parseQueryContext } from './contextAnalyzer';
import { createMatchingTableSuggestions, createFallbackSuggestions } from './fallback-handler';
import { buildScopeStack, type SelectScope, type ParsedQueryStack } from './scopeStack';  // New Scope Stack integration

// 절별 자동완성 모듈
import { handleWhereCompletion } from './where-suggestions';
import { handleFromCompletion } from './from-suggestions';
import { handleSelectOnlyCompletion } from './select-suggestions';
import { handleOrderByCompletion } from './order-by-suggestions';

export interface CompletionContext {
    modelValue: string;        
    position: MonacoPosition;             
    word?: MonacoWord;                 
    sqlKeywords: string[];     
    tableColumns?: TableColumns  
}

/**
 * Monaco completion items 생성 (메인 진입점)
 */
export function createCompletionSuggestions(
    modelValue: string,        
    position: MonacoPosition,             
    word: MonacoWord,                 
    sqlKeywords: string[],     
    tableColumns?: TableColumns  
): CompletionItem[] {
    // 1. 커서 위치 분석 - 전용 모듈 delegations
    const parsedContext = parseQueryContext(modelValue, position);
    if (!parsedContext) return [];
    
    const { queryAtCursor, cursorOffsetInQuery } = parsedContext;

    const currentQuery = queryAtCursor.queryText;
    
    // 변수들을 먼저 선언 (if 블록 범위 밖에서 사용할 수 있도록)
    let textBeforeCursor: string = '';
    let effectiveCurrentWord: string = '';
    const currentWordUpper: string = '';

    // 2. Monaco 의 실제 라인 텍스트에서 정확하게 추출 (앞의 쿼리들에 상관없이 정확히)
    const allLines = modelValue.split('\n');
    
    // 현재 라인 번호의 텍스트 가져오기 (1-based 이므로 -1)
    const currentLineNumberIndex = position.lineNumber - 1;
    if (currentLineNumberIndex >= 0 && currentLineNumberIndex < allLines.length) {
        const currentLineText = allLines[currentLineNumberIndex];
        
        // 커서 위치까지의 텍스트만 추출 (column 도 1-based 이므로 -1)
        const textBeforeCursorActual = currentLineText.substring(0, position.column - 1);
        
        // 이 텍스트를 사용하여 단어 추출 및 A. 감지
        
        if (textBeforeCursorActual.trimEnd().endsWith('.') && 
            textBeforeCursorActual.trimEnd().length > 0) {
            const lastSpaceIdx = textBeforeCursorActual.lastIndexOf(' ');
            const potentialAlias = textBeforeCursorActual.substring(lastSpaceIdx + 1).trim().replace(/\.+$/, '');
            
            effectiveCurrentWord = potentialAlias ? `${potentialAlias}.` : '.';
        } else if (word?.word && word.word.length > 0) {
            effectiveCurrentWord = word.word.toUpperCase();        } else if (textBeforeCursorActual) {
            const lastTokenMatch = textBeforeCursorActual.match(/([A-Za-z0-9_]+)$/);
            if (lastTokenMatch) {
                effectiveCurrentWord = lastTokenMatch[1].toUpperCase();
            }
        }

        // Monaco 에서 계산한 텍스트를 기반으로 절 분석 등 모든 작업 수행
        // 하지만 절 분석에는 전체 쿼리 사용 (짧은 부분만 보면 FROM 을 못 찾음!)
        const textAtCursor = currentQuery.substring(0, cursorOffsetInQuery || 0);
        textBeforeCursor = textAtCursor;

    } else {
        // Fallback: queryAtCursor 기반 분석 - 현재 라인 텍스트 추출 실패시
        const fallbackLineNum = Math.floor(queryAtCursor.statementStartOffset / 80);
        const allLines = modelValue.split('\n');

        if (fallbackLineNum < allLines.length) {
            const currentQuery = queryAtCursor.queryText;
            textBeforeCursor = currentQuery.substring(0, cursorOffsetInQuery || 0);
        }
    }

    // 3. 절 분석 (nested query 고려 - 새로 구현된 Scope Stack 사용)
    let aliasToTableName: Record<string, string> = {};
    let activeScopeDepth = 0;
    let parsedStack: ParsedQueryStack | null = null;  // Store parsedStack for access outside try-catch
    
    try {
        // NEW: Use scope stack for proper nested query handling
        parsedStack = buildScopeStack(currentQuery, cursorOffsetInQuery || 0);
        const activeScope = parsedStack.cursorContext.activeScope;
        activeScopeDepth = parsedStack.cursorContext.calculatedDepth;  // Single source of truth for depth

        // Extract alias mappings from ACTIVE SCOPE only (respecting nested boundaries)
        if (activeScope && activeScope.clauses.length > 0) {
            const fromClause = activeScope.clauses.find((c: SelectScope['clauses'][number]) => c.type === 'FROM');
            if (fromClause && fromClause.position < (cursorOffsetInQuery || 0)) {
                // Only use FROM clause that appears BEFORE cursor position
                const fromTextStart = fromClause.position;
                
                // FROM 블록 종료점: cursor 앞의 첫 non-JOIN clause 까지 (v10.41)
                // JOIN clause들은 FROM 블록의 일부이므로 경계로 취급하지 않음
                // (기존: endIndex가 첫 JOIN 시작점이라 JOIN 라인들이 segment에서 누락 → 모든 JOIN alias 유실)
                let fromTextEnd = cursorOffsetInQuery || currentQuery.length;
                for (const clause of activeScope.clauses) {
                    if (clause.type === 'JOIN') continue;
                    if (clause.position > fromClause.position && 
                        clause.position < fromTextEnd) {
                        fromTextEnd = Math.min(fromTextEnd, clause.position);
                    }
                }
                
                const scopeSegment = currentQuery.substring(fromTextStart, fromTextEnd);
                aliasToTableName = extractFromClause(scopeSegment);
            }
        } else if (activeScope && !activeScope.clauses.some((c: SelectScope['clauses'][number]) => c.type === 'FROM')) {
            // No FROM clause yet in current scope - CRITICAL: do NOT fall back to outer query!
            // This is a nested subquery that hasn't reached its own FROM clause yet
            aliasToTableName = {};  // Explicitly set to empty, NEVER fall back to outer query here!
        }
        
        // Fallback to full query extraction if we have no valid mapping yet
        // This handles edge cases where scope detection fails or nested queries confuse the parser
        if (Object.keys(aliasToTableName).length === 0) {
            console.warn('[Completion] No alias mappings found, falling back to full query extraction');
            const fallbackMapping = extractFromClause(currentQuery);
            if (fallbackMapping && Object.keys(fallbackMapping).length > 0) {
                aliasToTableName = fallbackMapping;
                console.log('[Completion] Fallback succeeded - found tables:', Object.keys(aliasToTableName));
            } else {
                console.warn('[Completion] Fallback also failed - no tables extracted');
                aliasToTableName = {};
            }
        }
    } catch(err) {
        console.error('[Completion] Scoped extraction failed:', err);
        const fallbackMapping = extractFromClause(currentQuery);
        aliasToTableName = fallbackMapping || {};
    }

    // 4. 절 분석 - NOW USES activeScopeDepth from scopeStack as SINGLE SOURCE OF TRUTH
    // CRITICAL: Use parsedStack for all depth-dependent operations to ensure consistency
    const cursorOffsetFinal = cursorOffsetInQuery > 0 ? cursorOffsetInQuery : (currentQuery.length - 1);
    
    // For backward compatibility with existing clause analyzer, we still call it
    // BUT priority is given to activeScope from scopeStack for all nested query decisions
    let { currentClause } = analyzeSQLClauses(currentQuery, cursorOffsetFinal);
    
    // CRITICAL FIX: Override currentClause based on activeScope context for nested queries
    // If we're in a nested scope (activeScopeDepth > 0) and activeScope has no FROM clause yet,
    // NEVER fall back to outer query's FROM - force SELECT-only mode
    if (parsedStack && parsedStack.cursorContext.activeScope) {
        const activeScopeClauses = parsedStack.cursorContext.activeScope.clauses;
        const hasActiveFromClause = activeScopeClauses.some((c: SelectScope['clauses'][number]) => c.type === 'FROM');
        
        // Check cursor position in current scope
        const lastKeywordInCurrentScope = activeScopeClauses[activeScopeClauses.length - 1];
        
        if (activeScopeDepth > 0 && !hasActiveFromClause && (!lastKeywordInCurrentScope || lastKeywordInCurrentScope.type === 'SELECT')) {
            // We're inside a nested subquery that hasn't reached its FROM clause yet
            // Force currentClause to null (SELECT-only mode), regardless of what analyzeSQLClauses returned
            if (currentClause === 'FROM') {
                currentClause = null;  // Force SELECT-only mode
            }
        }
    }
    
    // CRITICAL FIX #J1: Enhanced nested query check - direct text analysis fallback
    // If scopeStack didn't detect activeScope but we clearly have a subquery before cursor, override anyway
    if (currentClause === 'FROM' && currentQuery.substring(0, cursorOffsetFinal).includes('(')) {
        const lastOpeningParen = currentQuery.lastIndexOf('(', cursorOffsetFinal - 1);
        
        // Check if there's SELECT inside the paren but no FROM yet
        if (lastOpeningParen >= 0) {
            const textInsideParenth = currentQuery.substring(lastOpeningParen + 1, cursorOffsetFinal);
            
            // Simple check: SELECT exists, FROM doesn't exist after SELECT at this position
            const hasSelectButNoFromAfterSelect = /\bSELECT\b/i.test(textInsideParenth) && 
                                                   !/\s+FROM\s|\nFROM\s/i.test(textInsideParenth);
            
            if (hasSelectButNoFromAfterSelect) {
                currentClause = null;  // Force SELECT-only mode
            }
        }
    }
    
    // CRITICAL FIX #2: Alias.column incomplete detection (e.g., "SELECT B." or "WHERE T.")
    // If user typed "alias.", suggest columns from that table
    if (effectiveCurrentWord && effectiveCurrentWord.endsWith('.') && effectiveCurrentWord.length > 1) {
        const aliasName = effectiveCurrentWord.slice(0, -1); // Remove trailing dot
        
        // Force SELECT-only mode if we have a matching alias for that table
        if (aliasName && aliasToTableName[aliasName]) {
            currentClause = null;  // Treat as SELECT-only to trigger column suggestions
        } else if (!aliasName) {
            console.warn('[Completion] Alias "." detected but no alias name found');
        } else {
            console.warn('[Completion] Alias "." detected but no matching table found:', aliasName);
        }
    }

    // Use scopeStack depth as truth for nested query detection - NO separate calculation!
    const isNestedQuery = activeScopeDepth > 0;
    const hasValidTableInFROM = Object.keys(aliasToTableName).length > 0;
    
    let targetTableName: string | null = null;	    let targetTableNames: string[] = [];

    let partialNameFromInput: string | null = null;
    let isDotFormatWithoutTrailingDot: boolean = false;  // "A<P>" 패턴 (A.P 에서 P 입력 중)

if (currentClause === 'FROM') {
        // Nested query 처리: 현재 섹션만 파싱 - activeScope 의 FROM 절 범위 사용
        const textToParse = textBeforeCursor;
        // TODO: Implement proper scoped parsing using activeScope boundaries
        
        const result = extractTableFromFROMClause(textToParse, tableColumns);
        targetTableName = result.targetTableName;
        partialNameFromInput = result.partialNameFromInput;
        
        // FROM 절이지만 테이블이 없으면 전체 자동완성으로 fallback
        if (!targetTableName && hasValidTableInFROM) {
            // nested 가 아니면 outer 의 마지막 테이블 사용 시도
            if (!isNestedQuery) {
                const outerFromMatch = textBeforeCursor.match(/FROM\s+([A-Za-z0-9_]+)\b/i);
                if (outerFromMatch?.[1]) {
                    partialNameFromInput = outerFromMatch[1].toUpperCase();
                }
            } else {
                // nested 라면 현재 입력된 텍스트만 사용
                if (effectiveCurrentWord && effectiveCurrentWord.length > 0) {
                    partialNameFromInput = effectiveCurrentWord;
                }
            }
        }

    } else if (currentClause === 'WHERE') {
        // WHERE 절에서 테이블명/alias 추출 - handleWhereCompletion 에 위임을 위한 파싱 정보 설정
        const result = resolveAliasInWHERE(effectiveCurrentWord, aliasToTableName, tableColumns);
        
        // 배열로 처리: 첫 번째 값을 targetTableName 으로 사용 (backward compatibility)
        if (result.targetTableNames && result.targetTableNames.length > 0) {
            targetTableNames = result.targetTableNames;
            targetTableName = result.targetTableNames[0];
        } else {
            targetTableNames = [];
            targetTableName = null;
        }
        partialNameFromInput = result.partialNameFromInput;

    } else if (!currentClause) {
        //  X. 형식 감지: 마지막 글자가 "." 인지 확인 (A. 입력 직후, 컬럼 입력 시작 안 함)
        let isJustDotAfterAlias = false;
        let previousCharIsSpace = false;
        
        if (textBeforeCursor.endsWith('.')) {
            // A. 바로 다음 (예: "SELECT DISTINCT A.")
            isJustDotAfterAlias = true;
        } else if (textBeforeCursor.trimEnd().length > 0) {
            // 끝이 공백인지 확인 (A. FRO - A. 다음에 공백 있고 다른 단어 입력 중)
            const trimmedLen = textBeforeCursor.trimEnd().length;
            previousCharIsSpace = textBeforeCursor[trimmedLen] === ' ';
            
            if (previousCharIsSpace && textBeforeCursor.endsWith('.')) {
                isJustDotAfterAlias = true;
            }
        }
        
        // Nested query 에서 "X." 형식 처리 (Oracle 스코핑 규칙 준수)
        let tableNameFromDot: string | null = null;
   
        if (effectiveCurrentWord && effectiveCurrentWord.endsWith('.')) {
            const aliasName = effectiveCurrentWord.substring(0, effectiveCurrentWord.length - 1).toUpperCase();
            
            // local scope 에서만 Alias 찾기 (OUTER 참조 불가 - Oracle 규칙!)
            tableNameFromDot = aliasToTableName[aliasName] || null;
        } else if (isJustDotAfterAlias) {
            // A. 입력 직후 - 마지막 단어 추출 (A 를 찾아야 함)
            const textBeforeTrimmed = textBeforeCursor.trimEnd();
            const lastSpaceIdx = textBeforeTrimmed.lastIndexOf(' ');
            
            if (lastSpaceIdx >= 0 && textBeforeTrimmed[lastSpaceIdx + 1] === '.') {
                // "... A." 형식
                const aliasName = textBeforeTrimmed.substring(lastSpaceIdx + 1, lastSpaceIdx + 2).toUpperCase();
                
                tableNameFromDot = aliasToTableName[aliasName] || null;
            }
        } else if (effectiveCurrentWord && effectiveCurrentWord.length === 1 && !previousCharIsSpace) {
            //  SINGLE CHAR 입력 중: 현재 테이블의 alias 가 선행되는지 확인 (A.P 패턴)
            // 예: "select DISTINCT A<P>" 에서 커서가 P 위에 있다면 textBeforeCursor 에는 "select DISTINCT A.P" 가 있음
            const textBefore = textBeforeCursor.trim();
            
            // 현재 effectiveCurrentWord 가 테이블 alias 뒤에 붙은 컬럼의 첫 글자인지 확인
            if (textBefore.length > 0 && Object.keys(aliasToTableName).length > 0) {
                for (const alias of Object.keys(aliasToTableName)) {
                    // "...A.P" 형태인지 확인 (alias 뒤에 점과 함께 currentChar 가 붙은 경우)
                    const pattern = new RegExp(`${alias}\\.${effectiveCurrentWord}$`, 'i');
                    if (pattern.test(textBefore)) {
                        tableNameFromDot = aliasToTableName[alias];
                        isDotFormatWithoutTrailingDot = true;
                        break;
                    }
                }
            }
        }
        
        if (tableNameFromDot) {
            // "X." 형식 또는 "A<char>" 패턴: INNER FROM 의 해당 테이블만 사용
            targetTableName = tableNameFromDot;
            partialNameFromInput = isDotFormatWithoutTrailingDot ? effectiveCurrentWord : null;
        } else {
            // 일반적인 테이블명 입력: 기존 로직 사용
            const result = extractTableFromSelectOnly(aliasToTableName, tableColumns);
            targetTableName = result.targetTableName;
            partialNameFromInput = result.partialNameFromInput;
        }
    }

    // 7. 절별 자동완성 분기 처리 - 전담 모듈로 위임
    if (currentClause === 'FROM') {
        return handleFromCompletion(
            partialNameFromInput,
            targetTableName,
            hasValidTableInFROM,
            tableColumns,
            sqlKeywords
        );

    } else if (currentClause === 'WHERE') {
        return handleWhereCompletion(
            currentWordUpper,
            effectiveCurrentWord,
            targetTableName,  // backward compatibility 용 단일 값
            targetTableNames,  // NEW: 모든 FROM 의 테이블 목록 (배열)
            partialNameFromInput,
            aliasToTableName,
            tableColumns,
            sqlKeywords
        );

    } else if (!currentClause) {
        return handleSelectOnlyCompletion(
            partialNameFromInput,
            targetTableName,
            tableColumns,
            sqlKeywords,
            effectiveCurrentWord,  // "X." 처리를 위한 파라미터
            isDotFormatWithoutTrailingDot  //  A<P> 패턴 (A.P 에서 P 입력 중)
        );

    } else if (currentClause === 'ORDER BY') {
        return handleOrderByCompletion(
            partialNameFromInput,
            targetTableName,
            tableColumns,
            aliasToTableName,
            effectiveCurrentWord  //  "X." 처리를 위한 파라미터 추가
        );    } else {
        // 나머지 모든 절 (GROUP BY 등) - Fallback: 전용 핸들러로 위임
        if (partialNameFromInput && tableColumns) {
            const matchingSuggestions = createMatchingTableSuggestions(partialNameFromInput, tableColumns);
            
            if (matchingSuggestions) {
                return matchingSuggestions;
            }
        }

        // 최종 fallback: 전체 테이블 + 키워드
        return createFallbackSuggestions(sqlKeywords, tableColumns);
    }
}


