/**
 * SQL 자동완성 진입점 - Monaco 에디터용 메인 함수
 * 절별 분기 처리: WHERE, FROM, SELECT 로 분리된 모듈 사용
 */

import { extractFromClause } from '../sqlContextAnalyzer/contextExtractor';
import type { TableColumns, CompletionItem } from './types';
import { analyzeSQLClauses, extractTableFromFROMClause, resolveAliasInWHERE, extractTableFromSelectOnly } from './parser';
import { parseQueryContext } from './contextAnalyzer';
import { extractCurrentWord } from './wordExtractor';
import { logNestedContext, findCurrentSelectInfo, calculateParenDepth, findSelectPositions } from './debugUtils';
import { createMatchingTableSuggestions, createFallbackSuggestions } from './fallback-handler';

// 절별 자동완성 모듈
import { handleWhereCompletion } from './where-suggestions';
import { handleFromCompletion } from './from-suggestions';
import { handleSelectOnlyCompletion } from './select-suggestions';
import { handleOrderByCompletion } from './order-by-suggestions';
import { extractScopedAliases } from './scope';

export interface CompletionContext {
    modelValue: string;        
    position: any;             
    word: any;                 
    sqlKeywords: string[];     
    tableColumns?: TableColumns  
}

/**
 * Monaco completion items 생성 (메인 진입점)
 */
export function createCompletionSuggestions(
    modelValue: string,        
    position: any,             
    word: any,                 
    sqlKeywords: string[],     
    tableColumns?: TableColumns,  
    monacoInstance?: any  // Monaco 객체 추가
): any[] {
    // 1. 커서 위치 분석 - 전용 모듈 delegations
    const parsedContext = parseQueryContext(modelValue, position);
    if (!parsedContext) return [];
    
    const { queryAtCursor, cursorOffsetInQuery } = parsedContext;

    console.log('[Completion] DEBUG CURSOR CONTEXT:', {
        fullModelValue: modelValue.length > 100 ? `${modelValue.substring(0, 50)}...` : modelValue,
        modelLength: modelValue.length,
        cursorOffsetInQuery,
        queryAtCursor: queryAtCursor.queryText,
        statementStartLine: queryAtCursor.statementStartOffset === undefined ? 'N/A' : queryAtCursor.statementStartOffset,
        MonacoPosition: position  // 추가
    });

    const currentQuery = queryAtCursor.queryText;
    
    // 변수들을 먼저 선언 (if 블록 범위 밖에서 사용할 수 있도록)
    let textBeforeCursor: string = '';
    let effectiveCurrentWord: string = '';
    let currentWordUpper: string = '';

    // 2. Monaco 의 실제 라인 텍스트에서 정확하게 추출 (앞의 쿼리들에 상관없이 정확히)
    console.log('[Completion] DEBUG MONACO POSITION:', {
        lineNumber: position.lineNumber,
        column: position.column,
        fullModelLength: modelValue.length
    });

    // Monaco 의 실제 라인 텍스트에서 정확하게 추출 (앞의 쿼리들에 상관없이 정확히)
    const allLines = modelValue.split('\n');
    
    // 현재 라인 번호의 텍스트 가져오기 (1-based 이므로 -1)
    const currentLineNumberIndex = position.lineNumber - 1;
    if (currentLineNumberIndex >= 0 && currentLineNumberIndex < allLines.length) {
        const currentLineText = allLines[currentLineNumberIndex];
        
        // 커서 위치까지의 텍스트만 추출 (column 도 1-based 이므로 -1)
        const textBeforeCursorActual = currentLineText.substring(0, position.column - 1);
        
        console.log('[Completion] DEBUG ACTUAL LINE TEXT:', {
            lineNum: position.lineNumber,
            lineContent: currentLineText.slice(-50),  // 라인의 마지막 50 자만
            cursorColumn: position.column,
            textBeforeCursorActual,
            length: textBeforeCursorActual.length,
            endsWithDot: textBeforeCursorActual.endsWith('.'),
            last10chars: textBeforeCursorActual.slice(-20)
        });

        // 이 텍스트를 사용하여 단어 추출 및 A. 감지
        
        if (textBeforeCursorActual.trimEnd().endsWith('.') && 
            textBeforeCursorActual.trimEnd().length > 0) {
            const lastSpaceIdx = textBeforeCursorActual.lastIndexOf(' ');
            const potentialAlias = textBeforeCursorActual.substring(lastSpaceIdx + 1).trim();
            
            console.log('[Completion] DETECTED DOT FORMAT (ACTUAL MONACO):', {
                alias: potentialAlias,
                entirePrefix: textBeforeCursorActual.slice(-30)
            });
            
            effectiveCurrentWord = potentialAlias ? `${potentialAlias}.` : '.';
        } else if (word?.word && word.word.length > 0) {
            effectiveCurrentWord = word.word.toUpperCase();        } else if (textBeforeCursorActual) {
            const lastTokenMatch = textBeforeCursorActual.match(/([A-Za-z0-9_]+)$/);
            if (lastTokenMatch) {
                effectiveCurrentWord = lastTokenMatch[1].toUpperCase();
            }
        }

        const currentWordUpper = effectiveCurrentWord;  // Monaco 에서 계산 (이전 line에서 선언되었으므로 재선언 안함)

        console.log('[COMPLETION] USING MONACO ACTUAL TEXT FOR WORD EXTRACTION:', {
            actualText: textBeforeCursorActual,
            computedWord: effectiveCurrentWord,
            endsWithDot: textBeforeCursorActual.endsWith('.')
        });

        // Monaco 에서 계산한 텍스트를 기반으로 절 분석 등 모든 작업 수행
        // 하지만 절 분석에는 전체 쿼리 사용 (짧은 부분만 보면 FROM 을 못 찾음!)
        const textAtCursor = currentQuery.substring(0, cursorOffsetInQuery || 0);
        textBeforeCursor = textAtCursor;

        console.log('[COMPLETION] USING MONACO ACTUAL TEXT FOR WORD EXTRACTION:', {
            actualText: textBeforeCursorActual,
            computedWord: effectiveCurrentWord,
            endsWithDot: textBeforeCursorActual.endsWith('.'),
            analysisContextLength: textAtCursor.length + '(전체 쿼리 사용)'
        });

    } else {
        // Fallback: queryAtCursor 기반 분석 - 현재 라인 텍스트 추출 실패시
        const fallbackLineNum = Math.floor(queryAtCursor.statementStartOffset / 80);
        const allLines = modelValue.split('\n');

        if (fallbackLineNum < allLines.length) {
            const currentQuery = queryAtCursor.queryText;
            textBeforeCursor = currentQuery.substring(0, cursorOffsetInQuery || 0);

            console.log('[Completion] FALLBACK TO QUERY-CALCULATED TEXT:', {
                raw: textBeforeCursor,
                length: textBeforeCursor.length,
                endsWithDot: textBeforeCursor.endsWith('.')
            });
        }
    }

    // 3. 절 분석 (nested query 고려 - 공통 로직)
    let aliasToTableName: Record<string, string> = {};
    try {
        const scopedResult = extractScopedAliases(currentQuery, cursorOffsetInQuery || 0);

        console.log('[COMPLETION] SCOPE-AWARE ALIAS EXTRACTION:', {
            isNested: scopedResult.isNested,
            currentDepth: scopedResult.isNested ? 'nested' : 'root',
            localAliases: Object.keys(scopedResult.localAliases).join(', ') || 'none'
        });

        aliasToTableName = scopedResult.localAliases;  // INNER scope 만 사용 (Oracle 규칙 준수)
    } catch(err) {
        console.error('[Completion] Scoped extraction failed:', err);
        const fallbackMapping = extractFromClause(currentQuery);
        aliasToTableName = fallbackMapping || {};
    }

    // 4. 절 분석 (nested query 고려)
    const { currentClause, lastFromIdx } = analyzeSQLClauses(textBeforeCursor);

    // Debug logging - 전용 모듈 위임
    logNestedContext(textBeforeCursor, currentClause, lastFromIdx, aliasToTableName);
    
    // 현재 parentheses 깊이 계산 및 SELECT 정보 추출
    const parenDepth = calculateParenDepth(textBeforeCursor);
    const selectPositions = findSelectPositions(textBeforeCursor);
    const isNestedQuery = parenDepth > 0;
    const currentSelectInfo = findCurrentSelectInfo(textBeforeCursor, parenDepth);

    // 5. FROM 절에서 테이블이 실제로 추출되었는지 확인
    const hasValidTableInFROM = Object.keys(aliasToTableName).length > 0;
    
    let targetTableName: string | null = null;
    let partialNameFromInput: string | null = null;
    let isInsideSelectOnly = false;
    let isDotFormatWithoutTrailingDot: boolean = false;  //  "A<P>" 패턴 (A.P 에서 P 입력 중)

    if (currentClause === 'FROM') {
        isInsideSelectOnly = true;
        
        // Nested query 처리: 현재 SELECT 범위만 파싱
        let textToParse = textBeforeCursor;
        if (isNestedQuery && currentSelectInfo) {
            console.log('[COMPLETION] Nested FROM 절 감지! current select 영역만 파싱...');
            textToParse = textBeforeCursor.substring(currentSelectInfo.pos);
        }

        const result = extractTableFromFROMClause(textToParse, tableColumns);
        targetTableName = result.targetTableName;
        partialNameFromInput = result.partialNameFromInput;
        
        console.log(`[COMPLETION] FROM 파싱 결과:`, { 
            textUsedForParsing: textToParse.length > 100 ? `${textToParse.substring(0, 50)}...` : textToParse,
            targetTableName,
            partialNameFromInput
        });
        
        // FROM 절이지만 테이블이 없으면 전체 자동완성으로 fallback
        if (!targetTableName && hasValidTableInFROM) {
            console.log('[Completion] FROM 절에서 현재 입력된 테이블을 찾지 못했습니다.');
            
            // nested 가 아니면 outer 의 마지막 테이블 사용 시도
            if (!isNestedQuery) {
                console.log('[COMPLETION]  fallback: last from table 사용');
                const outerFromMatch = textBeforeCursor.match(/FROM\s+([A-Za-z0-9_]+)\b/i);
                if (outerFromMatch?.[1]) {
                    partialNameFromInput = outerFromMatch[1].toUpperCase();
                }
            } else {
                // nested 라면 현재 입력된 텍스트만 사용
                console.log('[COMPLETION]  fallback: nested 에서 현재 입력된 텍스트만 사용');
                if (effectiveCurrentWord && effectiveCurrentWord.length > 0) {
                    partialNameFromInput = effectiveCurrentWord;
                }
            }
        }

    } else if (currentClause === 'WHERE') {
        // WHERE 절에서 테이블명/alias 추출 - handleWhereCompletion 에 위임을 위한 파싱 정보 설정
        const result = resolveAliasInWHERE(effectiveCurrentWord, aliasToTableName, tableColumns);
        targetTableName = result.targetTableName;
        partialNameFromInput = result.partialNameFromInput;

    } else if (!currentClause) {
        isInsideSelectOnly = true;
        
        //  X. 형식 감지: 마지막 글자가 "." 인지 확인 (A. 입력 직후, 컬럼 입력 시작 안 함)
        let isJustDotAfterAlias = false;
        let previousCharIsSpace = false;
        
        if (textBeforeCursor.endsWith('.')) {
            // A. 바로 다음 (예: "SELECT DISTINCT A.")
            isJustDotAfterAlias = true;
            console.log('[COMPLETION] Dot detected at end of text:', textBeforeCursor.slice(-20));
        } else if (textBeforeCursor.trimEnd().length > 0) {
            // 끝이 공백인지 확인 (A. FRO - A. 다음에 공백 있고 다른 단어 입력 중)
            const trimmedLen = textBeforeCursor.trimEnd().length;
            previousCharIsSpace = textBeforeCursor[trimmedLen] === ' ';
            
            if (previousCharIsSpace && textBeforeCursor.endsWith('.')) {
                isJustDotAfterAlias = true;
                console.log('[COMPLETION] Dot with trailing space detected');
            }
        }
        
        // Nested query 에서 "X." 형식 처리 (Oracle 스코핑 규칙 준수)
        let tableNameFromDot: string | null = null;
   
        if (effectiveCurrentWord && effectiveCurrentWord.endsWith('.')) {
            const aliasName = effectiveCurrentWord.substring(0, effectiveCurrentWord.length - 1).toUpperCase();
            
            console.log('[COMPLETION] NESTED SELECT DOT FORMAT:', {
                detected: effectiveCurrentWord,
                aliasName: aliasName,
                availableAliases: Object.keys(aliasToTableName).join(', ') || 'none'
            });
            
            // local scope 에서만 Alias 찾기 (OUTER 참조 불가 - Oracle 규칙!)
            tableNameFromDot = aliasToTableName[aliasName] || null;
        } else if (isJustDotAfterAlias) {
            // A. 입력 직후 - 마지막 단어 추출 (A 를 찾아야 함)
            const textBeforeTrimmed = textBeforeCursor.trimEnd();
            const lastSpaceIdx = textBeforeTrimmed.lastIndexOf(' ');
            
            if (lastSpaceIdx >= 0 && textBeforeTrimmed[lastSpaceIdx + 1] === '.') {
                // "... A." 형식
                const aliasName = textBeforeTrimmed.substring(lastSpaceIdx + 1, lastSpaceIdx + 2).toUpperCase();
                
                console.log('[COMPLETION] JUST DOT DETECTED:', {
                    alias: aliasName,
                    availableAliases: Object.keys(aliasToTableName),
                    currentSegment: textBeforeCursor.slice(-30)
                });
                
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
                        console.log('[COMPLETION] DETECTED A.P PATTERN:', {
                            alias: alias,
                            tableName: aliasToTableName[alias],
                            partialChar: effectiveCurrentWord
                        });
                        tableNameFromDot = aliasToTableName[alias];
                        isDotFormatWithoutTrailingDot = true;
                        break;
                    }
                }
            }
        }
        
        if (tableNameFromDot) {
            // "X." 형식 또는 "A<char>" 패턴: INNER FROM 의 해당 테이블만 사용
            console.log('[COMPLETION]  Resolved to INNER table:', tableNameFromDot, isDotFormatWithoutTrailingDot ? '(without dot)' : '');
            targetTableName = tableNameFromDot;
            partialNameFromInput = isDotFormatWithoutTrailingDot ? effectiveCurrentWord : null;
        } else {
            // 일반적인 테이블명 입력: 기존 로직 사용
            console.log('[COMPLETION] ️ Not a dot format, using standard extraction');
            const result = extractTableFromSelectOnly(aliasToTableName, tableColumns);
            targetTableName = result.targetTableName;
            partialNameFromInput = result.partialNameFromInput;
        }
    }
    console.log('[Completion]  Final state:', { 
        clause: currentClause, 
        isInsideSelectOnly, 
        targetTableName, 
        columnsAvailable: !!tableColumns?.[targetTableName || ''],
        metaCount: tableColumns ? Object.keys(tableColumns).length : 0
    });

    // 7. 절별 자동완성 분기 처리 - 전담 모듈로 위임
    if (currentClause === 'FROM') {
        console.log('[COMPLETION] FROM 절 자동완성 호출');
        return handleFromCompletion(
            partialNameFromInput,
            targetTableName,
            hasValidTableInFROM,
            tableColumns,
            sqlKeywords
        );

    } else if (currentClause === 'WHERE') {
        console.log('[COMPLETION] WHERE 절 자동완성 호출');
        return handleWhereCompletion(
            currentWordUpper,
            effectiveCurrentWord,
            targetTableName,
            partialNameFromInput,
            aliasToTableName,
            tableColumns,
            sqlKeywords
        );

    } else if (!currentClause) {
        console.log('[COMPLETION] SELECT-only 절 자동완성 호출', { 
            effectiveCurrentWord,
            isDotFormatWithoutTrailingDot,
            targetTableName 
        });
        return handleSelectOnlyCompletion(
            partialNameFromInput,
            targetTableName,
            tableColumns,
            sqlKeywords,
            effectiveCurrentWord,  // "X." 처리를 위한 파라미터
            isDotFormatWithoutTrailingDot  //  A<P> 패턴 (A.P 에서 P 입력 중)
        );

    } else if (currentClause === 'ORDER BY') {
        console.log('[COMPLETION] ORDER BY 절 자동완성 호출', { effectiveCurrentWord });
        return handleOrderByCompletion(
            partialNameFromInput,
            targetTableName,
            tableColumns,
            aliasToTableName,
            effectiveCurrentWord  //  "X." 처리를 위한 파라미터 추가
        );    } else {
        // 나머지 모든 절 (GROUP BY 등) - Fallback: 전용 핸들러로 위임
        console.log('[Completion] 다른 절에서 fallback 사용');
        
        if (partialNameFromInput && tableColumns) {
            const matchingSuggestions = createMatchingTableSuggestions(partialNameFromInput, tableColumns);
            
            if (matchingSuggestions) {
                return matchingSuggestions;
            }
        }

        // 최종 fallback: 전체 테이블 + 키워드
        console.log('[Completion] 최종 fallback 사용');
        return createFallbackSuggestions(sqlKeywords, tableColumns);
    }
}
