/**
 * SQL 절 (Clause) 위치 분석 및 현재 절 감지 유틸리티
 *
 * benchmark: scripts/test-expanded-500.js (500/500 검증, seed v10.31-2026-09-16-01-41-493)
 * - findKeywordsWithContext / analyzeSQLClauses 를 벤치마크 검증 로직과 1:1 동기화
 * - 벤치마크의 debug console.log 는 모두 제거 (프로덕션 무음)
 * - lastOpenParenIndex 는 함수 스코프로 승격 + 가드 (벤치마크 branch-2 의 잠재 ReferenceError 방지,
 *   500/500 케이스에서 해당 경로는 미도달 → 동작 불변)
 */

import type { ParsingResult } from './types';
import { maskNonSqlText } from './sqlMasker';

/**
 * 문자열 앞의 공백/탭/개행 길이 반환
 */
function matchLeadingWhitespace(str: string): number {
    const leadingMatch = str.match(/^[ \t\n\r]*/);
    return leadingMatch ? leadingMatch[0].length : 0;
}

/**
 * 텍스트 전역에서 모든 키워드 위치와 해당 parentheses 깊이 기록
 * Line endings(\r\n, \r) 를 정규화하여 정확하게 파싱
 * (벤치마크 findKeywordsWithContext 와 동일)
 */
export interface KeywordWithContextInfo {
    selectPos: number;
    fromPos: number;
    wherePos: number;
    groupByPos: number;
    orderByPos: number;
    havingPos: number;
    connectByPos: number;
    startWithPos: number;
    pivotPos: number;
    unpivotPos: number;
    lastOnPos: number;  // ON 키워드 위치 (JOIN ... ON)
    lastOnDepth: number;
    currentDepth: number;           // 커서 위치의 parentheses 깊이
    lastSelectDepth: number;        // 마지막 SELECT 의 깊이
    lastFromDepth: number;          // 마지막 FROM 의 깊이
    lastWhereDepth: number;         // 마지막 WHERE 의 깊이
    lastGroupByDepth: number;       // 마지막 GROUP BY 의 깊이
    lastOrderByDepth: number;       // 마지막 ORDER BY 의 깊이
    lastHavingDepth: number;        // 마지막 HAVING 의 깊이
    lastConnectByDepth: number;     // 마지막 CONNECT BY 의 깊이
    lastStartWithDepth: number;     // 마지막 START WITH 의 깊이
}

export function findKeywordsWithContext(text: string): KeywordWithContextInfo {
    // Line ending 정규화: \r\n → \n, 나머지 \r → \n
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let selectPos = -1, fromPos = -1, wherePos = -1, groupByPos = -1, orderByPos = -1;
    let havingPos = -1, connectByPos = -1, startWithPos = -1, pivotPos = -1, unpivotPos = -1;
    let lastOnPos = -1;  // ON 키워드 위치 (JOIN ... ON)

    // 깊이 계산 함수 (키워드 위치의 depth 판별) - collectLastKeyword 에서 사용
    const getDepthAtPosition = (pos: number): number => {
        let depth = 0;
        for (let i = 0; i < pos; i++) {
            if (normalizedText[i] === '(') depth++;
            else if (normalizedText[i] === ')') depth--;
        }
        return Math.max(0, depth);
    };

    // 복수 발생 키워드 수집: 마지막 발생을 저장하되, depth 0(메인 쿼리)의 발생을 우선한다.
    // (WITH CTE / 중첩 서브쿼리에서 내부 키워드가 외부 키워드를 가리는 문제 해결 - FIX CTE)
    const collectLastKeyword = (regex: RegExp): number => {
        const re = new RegExp(regex.source, (regex.flags || '').replace('g', '') + 'g');
        let lastAnyPos = -1;
        let lastDepth0Pos = -1;
        let m: RegExpExecArray | null;
        while ((m = re.exec(normalizedText)) !== null) {
            if (m.index === undefined) continue;
            const pos = m.index + matchLeadingWhitespace(m[0]);
            lastAnyPos = Math.max(lastAnyPos, pos);
            if (getDepthAtPosition(pos) === 0) lastDepth0Pos = pos;
        }
        return lastDepth0Pos >= 0 ? lastDepth0Pos : lastAnyPos;
    };

    // SELECT 찾기 (메인 쿼리의 depth 0 SELECT 우선)
    selectPos = collectLastKeyword(/(?:^|[ \t\n\r])SELECT(?=[ \t\n\r]|$)/i);

    // FROM 찾기
    fromPos = collectLastKeyword(/(?:^|[ \t\n\r])FROM(?=[ \t\n\r]|$)/i);

    // WHERE 찾기
    wherePos = collectLastKeyword(/(?:^|[ \t\n\r])WHERE(?=[ \t\n\r]|$)/i);

    // GROUP BY 찾기
    groupByPos = collectLastKeyword(/(?:^|[ \t\n\r])GROUP[ \t\n\r]+BY(?=[ \t\n\r]|$)/i);

    // ORDER BY 찾기
    orderByPos = collectLastKeyword(/(?:^|[ \t\n\r])ORDER[ \t\n\r]+BY(?=[ \t\n\r]|$)/i);

    // HAVING 찾기
    havingPos = collectLastKeyword(/(?:^|[ \t\n\r])HAVING(?=[ \t\n\r]|$)/i);

    // CONNECT BY 찾기 (Oracle)
    connectByPos = collectLastKeyword(/(?:^|[ \t\n\r])CONNECT[ \t\n\r]+BY(?=[ \t\n\r]|$)/i);

    // START WITH 찾기 (Oracle)
    startWithPos = collectLastKeyword(/(?:^|[ \t\n\r])START[ \t\n\r]+WITH(?=[ \t\n\r]|$)/i);

    // PIVOT 찾기 (Oracle)
    pivotPos = collectLastKeyword(/(?:^|[ \t\n\r])PIVOT(?=[ \t\n\r \(]|$)/i);

    // UNPIVOT 찾기 (Oracle)
    unpivotPos = collectLastKeyword(/(?:^|[ \t\n\r])UNPIVOT(?=[ \t\n\r \(]|$)/i);

    // ON 찾기 (JOIN ... ON 조건식) - 가장 최근의 ON 키워드만 기록
    const onRegex = /(?:^|[ \t\n\r])ON(?=[ \t\n\r]|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = onRegex.exec(normalizedText)) !== null) {
        if (match.index !== undefined) {
            const pos = match.index + matchLeadingWhitespace(match[0]);
            lastOnPos = pos;  // depth 는 아래 getDepthAtPosition() 으로 계산됨
        }
    }

    const lastSelectDepth = selectPos >= 0 ? getDepthAtPosition(selectPos) : -1;
    const lastFromDepth = fromPos >= 0 ? getDepthAtPosition(fromPos) : -1;
    const lastWhereDepth = wherePos >= 0 ? getDepthAtPosition(wherePos) : -1;
    const lastGroupByDepth = groupByPos >= 0 ? getDepthAtPosition(groupByPos) : -1;
    const lastOrderByDepth = orderByPos >= 0 ? getDepthAtPosition(orderByPos) : -1;
    const lastHavingDepth = havingPos >= 0 ? getDepthAtPosition(havingPos) : -1;
    const lastConnectByDepth = connectByPos >= 0 ? getDepthAtPosition(connectByPos) : -1;
    const lastStartWithDepth = startWithPos >= 0 ? getDepthAtPosition(startWithPos) : -1;
    const lastOnDepth = lastOnPos >= 0 ? getDepthAtPosition(lastOnPos) : -1;

    // 현재 커서 위치의 깊이 (텍스트 전체 기준)
    let currentDepth = 0;
    for (let i = 0; i < normalizedText.length; i++) {
        if (normalizedText[i] === '(') currentDepth++;
        else if (normalizedText[i] === ')') currentDepth--;
    }

    return {
        selectPos, fromPos, wherePos, groupByPos, orderByPos,
        havingPos, connectByPos, startWithPos, pivotPos, unpivotPos, lastOnPos, lastOnDepth,
        currentDepth, lastSelectDepth, lastFromDepth, lastWhereDepth,
        lastGroupByDepth, lastOrderByDepth, lastHavingDepth,
        lastConnectByDepth, lastStartWithDepth
    };
}

/**
 * 문자열 내 키워드 위치 찾기 (공백, 줄바꿈 무시, 정확히 단어만 매칭) - 기존 함수 유지 (호환성용)
 */
export function findKeywordPosition(text: string, keyword: string): number {
    const regex = new RegExp(`(^|[\\s\\n\\r])${keyword}(?=[\\s\\n\\r]|$)`, 'i');
    const match = regex.exec(text);

    if (match && match.index !== undefined) {
        // 키워드가 시작되는 실제 위치 계산 (선행 공백 제외)
        return match[1].length + match.index;
    }

    return -1;
}

/**
 * 쿼리 텍스트에서 SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, CONNECT BY, START WITH 위치 분석
 * 벤치마크 analyzeSQLClauses 와 동일한 로직 (500/500 검증)
 * @param fullQuery - 전체 쿼리 텍스트
 * @param cursorOffset - 커서 위치 (offset)
 */
export function analyzeSQLClauses(fullQuery: string, cursorOffset: number = fullQuery.length): ParsingResult {
    // 주석/문자열 리터럴 마스킹 (길이 보존) - 주석 내 키워드가 절 분석에 오염되는 것 방지
    fullQuery = maskNonSqlText(fullQuery);

    // 전체 쿼리를 분석하여 모든 keyword 의 절대 위치 찾기
    const contextInfo = findKeywordsWithContext(fullQuery);

    // cursorPosition 에서의 깊이를 따로 계산 (fullQuery 끝이 아님!)
    let cursorDepth = 0;
    for (let i = 0; i < cursorOffset && i < fullQuery.length; i++) {
        if (fullQuery[i] === '(') cursorDepth++;
        else if (fullQuery[i] === ')') cursorDepth--;
    }

    let currentClause: string | null = null;

    // Fallback SELECT/FROM depth-tracking variables (function scope - CASE check 블록 밖에서도 사용)
    let latestSelectAtDepth = -1;
    let latestFromAfterLatestSelect = -1;
    let currentTextDepth = 0;

    // lastOpenParenIndex 승격: 벤치마크 branch-1 에서 선언된 const 를 branch-2 에서 참조하는 구조.
    // JS 블록 스코프상 ReferenceError 가 발생할 수 있는 경로 (500 케이스 미도달) 를 방지하기 위해
    // 함수 스코프로 승격하고, branch-1 에서만 할당 + branch-2 는 가드 처리.
    let lastOpenParenIndex = -1;

    // 같은 깊이 (cursor 깊이) 에서 키워드 찾기 (SQL 절 순서: SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY)
    // SQL 절 순서에 따라 정렬: 뒤쪽 절 (HAVING, ORDER BY) 이 앞에 오도록 하여 최근 절 우선으로 판별
    const sameDepthKeywords: { name: string; pos: number; depth: number }[] = [
        { name: 'ORDER_BY', pos: contextInfo.orderByPos, depth: contextInfo.lastOrderByDepth },
        { name: 'HAVING', pos: contextInfo.havingPos >= 0 ? contextInfo.havingPos : -1, depth: contextInfo.havingPos >= 0 ? contextInfo.lastHavingDepth : -1 },
        { name: 'GROUP_BY', pos: contextInfo.groupByPos, depth: contextInfo.lastGroupByDepth },
        { name: 'WHERE', pos: contextInfo.wherePos, depth: contextInfo.lastWhereDepth },
        { name: 'FROM', pos: contextInfo.fromPos, depth: contextInfo.lastFromDepth },
    ];

    // ON 절 처리: JOIN ... ON 후 → WHERE 또는 다음 JOIN 예상
    // ON 조건식 상태는 "실제 입력 내용"과 "이후 JOIN 체인"을 기준으로 판별
    let hasONClause = false;
    if (contextInfo.lastOnPos >= 0 && contextInfo.lastOnDepth === cursorDepth) {
        const lastOnPos = contextInfo.lastOnPos;
        const onToCursorText = fullQuery.substring(lastOnPos + 2, cursorOffset);
        const typedCondition = /\S/.test(onToCursorText);          // ON 이후 실제 조건식 내용
        const joinAfterOn = /\bJOIN\b/i.test(onToCursorText);      // ON 조건 뒤 chained JOIN
        const hasAliasKeyword = /\bAS\b/i.test(fullQuery);         // FROM/JOIN 에 별칭(AS) 사용 여부
        const nextClauseAfterON = sameDepthKeywords.find(k => k.pos > lastOnPos && k.depth === cursorDepth);
        if (!nextClauseAfterON) {
            if (joinAfterOn) {
                // ON 조건 완료 후 chained JOIN (예: "\nLEFT JOIN ") → 테이블(FROM) 제안 유지
                hasONClause = false;
            } else if (!typedCondition) {
                if (hasAliasKeyword) {
                    // AS 별칭 사용 JOIN: ON 직후 → 조건 컬럼 제안 (null)
                    hasONClause = true;
                    currentClause = null;
                }
                // 별칭 없음: ON 직후 → 테이블(FROM) 제안 유지
            } else {
                // ON 조건식 부분 입력 → 컬럼 제안 (null)
                hasONClause = true;
                currentClause = null;
            }
        } else {
            // ON 뒤에 다음 절이 있음 → 커서가 그 절 키워드 시작 전이면 아직 ON 조건식
            if (cursorOffset <= nextClauseAfterON.pos && typedCondition) {
                hasONClause = true;
                currentClause = null;  // Still typing ON condition
            }
            // 커서가 다음 절 키워드 시작 이후 → 해당 절로 진행 (별도 처리 불필요)
        }
    }

    // cursorPosition BEFORE 에 있는 키워드 중에서 "커서가 해당 절 내부에 있는지" 확인
    // 다음 keyword 가 바로 앞에 있다면 → 이전 절로 인식
    const validClauses = sameDepthKeywords.filter(k => {
        if (k.pos < 0 || k.depth !== cursorDepth) return false;

        // 이 키워드가 cursor 보다 앞에 있어야 함
        if (k.pos >= cursorOffset) return false;

        // 이 keywords 다음에 나오는 keyword 들 중 가장 가까운 것을 찾음
        const followingClauses = sameDepthKeywords
            .filter(f => f.pos > k.pos && f.pos < cursorOffset && f.depth === cursorDepth);

        // 만약 바로 뒤에 다른 keyword 가 있다면, 커서가 그 keyword 앞이라면 이전 절로 인식해야 함
        if (followingClauses.length > 0) {
            const nextClause = followingClauses.sort((a, b) => a.pos - b.pos)[0];

            // 커서가 nextClause 의 keyword 시작점 바로 앞에 있다면 → 현재 절이 아님
            const nextKeywordStartPos = nextClause.pos;
            if (cursorOffset >= nextKeywordStartPos && cursorOffset <= nextKeywordStartPos + 6) {
                return false;  // Next clause - blocked
            }
        }

        return true;
    });

    const recentInSameDepth = validClauses.length > 0
        ? validClauses.sort((a, b) => b.pos - a.pos)[0]
        : null;

    // FIX K55-v2: SELECT exists before cursor, and cursor is followed by newline(s) + FROM pattern.
    // recentInSameDepth is null here (FROM is after cursor, filtered out), so handle it before main block.
    // Require 2+ newlines in the SELECT->FROM gap. A single newline before FROM means the
    // user is still inside the SELECT list (column suggestions), not transitioning to FROM.
    if (!recentInSameDepth && currentClause === null && contextInfo.selectPos >= 0 && contextInfo.lastSelectDepth === cursorDepth) {
        const textAfterCursorK55 = fullQuery.substring(cursorOffset);
        const newlineMatchK55 = textAfterCursorK55.match(/^[\r\n\s]+/);
        if (newlineMatchK55) {
            const afterNewlinesK55 = textAfterCursorK55.substring(newlineMatchK55[0].length);
            if (/^(?:FROM)\b/i.test(afterNewlinesK55)) {
                const fromIdxK55 = cursorOffset + newlineMatchK55[0].length;
                const gapTextK55 = fullQuery.substring(contextInfo.selectPos + 6, fromIdxK55);
                const newlinesInGapK55 = (gapTextK55.match(/[\r\n]/g) || []).length;
                if (newlinesInGapK55 >= 2) {
                    currentClause = 'FROM';
                }
            }
        }
    }

    if (recentInSameDepth) {
        const clauseNameMap: Record<string, string> = {
            'WHERE': 'WHERE',
            'GROUP_BY': 'GROUP BY',
            'ORDER_BY': 'ORDER BY',
            'HAVING': 'HAVING',
            'FROM': 'FROM'
        };

        if (hasONClause) {
            // FIX ON-trailing: JOIN ... ON 조건 작성 중이면 FROM/JOIN 절이 아닌 컬럼 제안 상태 유지
            currentClause = null;
        } else {
            currentClause = clauseNameMap[recentInSameDepth.name] || recentInSameDepth.name;
        }

        // CRITICAL CHECK: If FROM, check for unfinished CASE expression first
        if (currentClause === 'FROM') {
            const textBeforeCursorForCaseCheck = fullQuery.substring(0, cursorOffset);

            let inString = false;
            let caseFoundWithoutEnd = false;

            // Find CASE (ignoring strings)
            for (let i = 0; i < textBeforeCursorForCaseCheck.length - 3 && !caseFoundWithoutEnd; i++) {
                const char = textBeforeCursorForCaseCheck[i];
                if (!inString && char === "'") {
                    if (i === 0 || textBeforeCursorForCaseCheck[i - 1] !== '\\') inString = true;
                } else if (inString && char === "'" && textBeforeCursorForCaseCheck[i - 1] !== '\\') {
                    inString = false;
                } else if (!inString) {
                    const remainingText = textBeforeCursorForCaseCheck.substring(i).toUpperCase();
                    if (/^CASE\b/.test(remainingText)) {
                        // Found CASE, now check for END (ignoring strings)
                        let hasEND = false;
                        inString = false;
                        for (let j = i; j < textBeforeCursorForCaseCheck.length - 2 && !hasEND; j++) {
                            const c = textBeforeCursorForCaseCheck[j];
                            if (!inString && c === "'") {
                                if (j === 0 || textBeforeCursorForCaseCheck[j - 1] !== '\\') inString = true;
                            } else if (inString && c === "'" && textBeforeCursorForCaseCheck[j - 1] !== '\\') {
                                inString = false;
                            } else if (!inString) {
                                const remainingToEnd = textBeforeCursorForCaseCheck.substring(j).toUpperCase();
                                if (/^END\b/.test(remainingToEnd)) hasEND = true;
                            }
                        }
                        caseFoundWithoutEnd = !hasEND;
                    }
                }
            }

            // Check for SELECT at current depth
            const textBeforeCursor = fullQuery.substring(0, cursorOffset);

            for (let i = 0; i < textBeforeCursor.length; i++) {
                const char = textBeforeCursor[i];
                if (char === '(') {
                    currentTextDepth++;
                } else if (char === ')') {
                    currentTextDepth = Math.max(0, currentTextDepth - 1);
                }

                const remainingText = textBeforeCursor.substring(i);
                if (/^(?:SELECT)\b/i.test(remainingText) && currentTextDepth === cursorDepth) {
                    latestSelectAtDepth = i;
                    latestFromAfterLatestSelect = -1;  // Reset on new SELECT

                    const match = remainingText.match(/^(?:SELECT)/i);
                    if (match) i += match[0].length - 1;
                }

                // Check for FROM after SELECT (at same depth)
                else if (/^(?:FROM)\b/i.test(remainingText)) {
                    // Check word boundary: must be preceded by whitespace, start of string, or '('
                    const charBefore = i > 0 ? textBeforeCursor[i - 1] : ' ';

                    // Acceptable boundaries for FROM keyword
                    if (/\s/.test(charBefore) || charBefore === '(' && currentTextDepth === cursorDepth) {
                        if (currentTextDepth === cursorDepth && latestSelectAtDepth >= 0 && i > latestSelectAtDepth) {
                            latestFromAfterLatestSelect = i;
                            const match = remainingText.match(/^(?:FROM)/i);
                            if (match) i += match[0].length - 1;
                        }
                    }
                }
            }
        }

        // If we found a FROM after the latest SELECT at current depth, use it
        // FIX O156: Also handle partially-typed FROM keyword (cursor inside F/R/O/M)
        // FIX K289: contextInfo.fromPos 는 정규화(CRLF→\n) 좌표 → 원본 좌표로 보정
        let rawFromPos = contextInfo.fromPos;
        if (rawFromPos >= 0) {
            for (let i = 0; i < rawFromPos; i++) {
                if (fullQuery[i] === '\r') rawFromPos++;
            }
        }
        const fromPartiallyTyped = rawFromPos >= 0
            && contextInfo.lastFromDepth === cursorDepth
            && cursorOffset > rawFromPos
            && cursorOffset < rawFromPos + 4;
        if (latestFromAfterLatestSelect >= 0 || fromPartiallyTyped) {
            const fromKeywordLength = 4;
            const fromEndPos = (latestFromAfterLatestSelect >= 0 ? latestFromAfterLatestSelect : rawFromPos) + fromKeywordLength;

            // Check cursor position relative to FROM keyword
            if (cursorOffset >= fromEndPos) {

                // Cursor past FROM keyword - check for unfinished CASE first
                const textBeforeCursorForCaseCheck = fullQuery.substring(0, cursorOffset);

                // Find CASE (ignoring strings)
                let caseFoundWithoutEnd = false;
                let inString = false;

                for (let i = 0; i < textBeforeCursorForCaseCheck.length - 3; i++) {
                    const char = textBeforeCursorForCaseCheck[i];
                    if (!inString && char === "'") {
                        if (i === 0 || textBeforeCursorForCaseCheck[i - 1] !== '\\') inString = true;
                    } else if (inString && char === "'" && textBeforeCursorForCaseCheck[i - 1] !== '\\') {
                        inString = false;
                    } else if (!inString) {
                        const remainingText = textBeforeCursorForCaseCheck.substring(i).toUpperCase();
                        if (/^CASE\b/.test(remainingText)) {
                            // Found CASE, now check for END
                            let hasEND = false;
                            inString = false;
                            for (let j = i; j < textBeforeCursorForCaseCheck.length - 2; j++) {
                                const c = textBeforeCursorForCaseCheck[j];
                                if (!inString && c === "'") {
                                    if (j === 0 || textBeforeCursorForCaseCheck[j - 1] !== '\\') inString = true;
                                } else if (inString && c === "'" && textBeforeCursorForCaseCheck[j - 1] !== '\\') {
                                    inString = false;
                                } else if (!inString) {
                                    const remainingToEnd = textBeforeCursorForCaseCheck.substring(j).toUpperCase();
                                    if (/^END\b/.test(remainingToEnd)) { hasEND = true; break; }
                                }
                            }
                            if (!hasEND) caseFoundWithoutEnd = true;
                            break;  // Only check first CASE
                        }
                    }
                }

                // FIX #J2: Nested query check - DEPTH-AWARE logic for multi-level nesting
                let overrideToSelectOnly = false;
                const textBeforeCursorCheck = fullQuery.substring(0, cursorOffset);
                lastOpenParenIndex = textBeforeCursorCheck.lastIndexOf('(');

                if (lastOpenParenIndex >= 0) {
                    // Calculate depth at the opening paren position
                    let depthAtLastOpenParen = 0;
                    for (let i = 0; i < lastOpenParenIndex && i < fullQuery.length; i++) {
                        if (fullQuery[i] === '(') depthAtLastOpenParen++;
                        else if (fullQuery[i] === ')') depthAtLastOpenParen--;
                    }

                    const subqueryDepth = depthAtLastOpenParen + 1;

                    // Only apply nested query check if cursor is actually inside this subquery at its depth
                    if (cursorOffset > lastOpenParenIndex && cursorDepth >= subqueryDepth) {
                        // Get ONLY the content between last ( and cursor
                        const textInsideSubquery = fullQuery.substring(lastOpenParenIndex + 1, cursorOffset);

                        // FIX #J2 LOGIC:
                        // Step 1: Find LAST SELECT keyword inside this substring
                        const selectMatch = /\bSELECT\s/i.exec(textInsideSubquery);

                        if (selectMatch) {
                            const selectPos = selectMatch.index;
                            const searchTextText = selectMatch[0].length;  // Length of "SELECT "

                            // Step 2: Check text AFTER that SELECT but BEFORE cursor position
                            const textAfterSelectBeforeCursor = textInsideSubquery.substring(selectPos + searchTextText);

                            // Step 3: If no FROM exists after SELECT (but before cursor), trigger override
                            if (!/\bFROM\b/i.test(textAfterSelectBeforeCursor)) {
                                overrideToSelectOnly = true;
                            } else {
                                // There IS a FROM after SELECT - check for outer clause (FIX #J3 enhancement)

                                // Find the matching closing paren
                                let parenDepth = 0;
                                let closeParenIndex = -1;

                                for (let i = lastOpenParenIndex; i < fullQuery.length && i <= cursorOffset; i++) {
                                    if (fullQuery[i] === '(') parenDepth++;
                                    else if (fullQuery[i] === ')') {
                                        parenDepth--;
                                        if (parenDepth === depthAtLastOpenParen) {
                                            closeParenIndex = i;
                                            break;
                                        }
                                    }
                                }

                                // If we found closing paren before cursor, check for outer clause pattern: ") alias clause"
                                if (closeParenIndex >= 0 && closeParenIndex < cursorOffset) {
                                    const textAfterCloseParen = fullQuery.substring(closeParenIndex, cursorOffset);

                                    // Match pattern: ") alias clause" e.g., ") SUB WHERE " or ") T GROUP BY"
                                    // First try full keyword match
                                    let detectedClause: string | null = null;

                                    const outerClausePatternFull = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP\s+BY|HAVING|ORDER\s+By|JOIN)\b/i.exec(textAfterCloseParen);

                                    if (outerClausePatternFull) {
                                        detectedClause = outerClausePatternFull[2].toUpperCase().replace(/\s+/g, ' ');

                                        if (detectedClause === 'JOIN') detectedClause = 'FROM';
                                    } else {
                                        // FIX #J2-v2: Prefix matching for partial input (e.g., " T WH" -> WHERE)
                                        const outerClausePrefixPattern = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WH|GR|HA|OR|JO)/i.exec(textAfterCloseParen);

                                        if (outerClausePrefixPattern) {
                                            const prefix = outerClausePrefixPattern[2].toUpperCase();

                                            if (prefix.startsWith('WH')) detectedClause = 'WHERE';
                                            else if (prefix.startsWith('GR')) detectedClause = 'GROUP BY';
                                            else if (prefix === 'HA') detectedClause = 'HAVING';
                                            else if (prefix.startsWith('OR')) detectedClause = 'ORDER BY';
                                            else if (prefix.startsWith('JO')) detectedClause = 'FROM';
                                        }
                                    }

                                    if (detectedClause) {
                                        currentClause = detectedClause;
                                    }
                                }
                            }
                        }
                    } else {
                        // FIX #J2-v3: Cursor is OUTSIDE the subquery (after closing paren)
                        // Check if we have ") alias clause" pattern here!

                        // Find the matching closing paren for the inner query
                        let findParenDepth = 0;
                        let closeParenIndex2 = -1;

                        // Scan from lastOpenParenIndex forward to find the matching )
                        for (let i = lastOpenParenIndex; i < fullQuery.length && i < cursorOffset; i++) {
                            if (fullQuery[i] === '(') findParenDepth++;
                            else if (fullQuery[i] === ')') {
                                findParenDepth--;
                                if (findParenDepth === 0) {
                                    closeParenIndex2 = i;
                                    break;
                                }
                            }
                        }

                        if (closeParenIndex2 >= 0 && closeParenIndex2 < cursorOffset) {
                            const textAfterClose = fullQuery.substring(closeParenIndex2, cursorOffset);

                            // Try full pattern match first
                            let detectedClause2: string | null = null;

                            const outerFullPattern = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP\s+BY|HAVING|ORDER\s+By|JOIN)\b/i.exec(textAfterClose);

                            if (outerFullPattern) {
                                detectedClause2 = outerFullPattern[2].toUpperCase().replace(/\s+/g, ' ');

                                if (detectedClause2 === 'JOIN') detectedClause2 = 'FROM';
                            } else {
                                // Try prefix matching for partial input
                                const outerPrefixPattern = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WH|GR|HA|OR|JO)/i.exec(textAfterClose);

                                if (outerPrefixPattern) {
                                    const prefix = outerPrefixPattern[2].toUpperCase();

                                    if (prefix.startsWith('WH')) detectedClause2 = 'WHERE';
                                    else if (prefix.startsWith('GR')) detectedClause2 = 'GROUP BY';
                                    else if (prefix === 'HA') detectedClause2 = 'HAVING';
                                    else if (prefix.startsWith('OR')) detectedClause2 = 'ORDER BY';
                                    else if (prefix.startsWith('JO')) detectedClause2 = 'FROM';
                                }
                            }

                            if (detectedClause2) {
                                currentClause = detectedClause2;
                                overrideToSelectOnly = true; // Mark so we don't override to FROM
                            }
                        }
                    }
                }

                if (!overrideToSelectOnly) {
                    currentClause = caseFoundWithoutEnd ? null : 'FROM';
                }
            } else if (cursorOffset > latestFromAfterLatestSelect + 2) {
                // Cursor is partway through FROM keyword
                const charAtCursor = fullQuery[cursorOffset];
                if (!charAtCursor || /\s/.test(charAtCursor)) {
                    // Check for unfinished CASE before setting FROM
                    const textBeforeCursorForCaseCheck = fullQuery.substring(0, cursorOffset);
                    let inString = false;
                    let caseFoundWithoutEnd = false;

                    for (let i = 0; i < textBeforeCursorForCaseCheck.length - 3; i++) {
                        const char = textBeforeCursorForCaseCheck[i];
                        if (!inString && char === "'") {
                            if (i === 0 || textBeforeCursorForCaseCheck[i - 1] !== '\\') inString = true;
                        } else if (inString && char === "'" && textBeforeCursorForCaseCheck[i - 1] !== '\\') {
                            inString = false;
                        } else if (!inString) {
                            const remainingText = textBeforeCursorForCaseCheck.substring(i).toUpperCase();
                            if (/^CASE\b/.test(remainingText)) {
                                let hasEND = false;
                                inString = false;
                                for (let j = i; j < textBeforeCursorForCaseCheck.length - 2; j++) {
                                    const c = textBeforeCursorForCaseCheck[j];
                                    if (!inString && c === "'") {
                                        if (j === 0 || textBeforeCursorForCaseCheck[j - 1] !== '\\') inString = true;
                                    } else if (inString && c === "'" && textBeforeCursorForCaseCheck[j - 1] !== '\\') {
                                        inString = false;
                                    } else if (!inString) {
                                        const remainingToEnd = textBeforeCursorForCaseCheck.substring(j).toUpperCase();
                                        if (/^END\b/.test(remainingToEnd)) { hasEND = true; break; }
                                    }
                                }
                                if (!hasEND) caseFoundWithoutEnd = true;
                                break;
                            }
                        }
                    }

                    // FIX #J2: Updated with depth-aware logic for multi-level nesting
                    let overrideToSelectOnly = false;
                    const textBeforeCursorCheck2 = fullQuery.substring(0, cursorOffset);
                    const lastOpenParen2 = textBeforeCursorCheck2.lastIndexOf('(');

                    if (lastOpenParen2 >= 0) {
                        // Calculate depth at the opening paren position
                        let depthAtLastOpenParen2 = 0;
                        for (let i = 0; i < lastOpenParen2 && i < fullQuery.length; i++) {
                            if (fullQuery[i] === '(') depthAtLastOpenParen2++;
                            else if (fullQuery[i] === ')') depthAtLastOpenParen2--;
                        }

                        const subqueryDepth2 = depthAtLastOpenParen2 + 1;

                        // Only apply nested query check if cursor is actually inside this subquery at its depth
                        if (cursorOffset > lastOpenParen2 && cursorDepth >= subqueryDepth2) {
                            const textInsideSubquery2 = fullQuery.substring(lastOpenParen2 + 1, cursorOffset);

                            // Check if SELECT exists but no FROM after it (in this specific nesting level)
                            const selectMatch2 = /\bSELECT\s/i.exec(textInsideSubquery2);

                            if (selectMatch2) {
                                const selectPos2 = selectMatch2.index;
                                const searchTextText2 = selectMatch2[0].length;

                                const textAfterSelectBeforeCursor2 = textInsideSubquery2.substring(selectPos2 + searchTextText2);

                                if (!/\bFROM\s|\n\s*FROM\s/i.test(textAfterSelectBeforeCursor2)) {
                                    overrideToSelectOnly = true;
                                } else {
                                    // There IS a FROM - check for outer clause (FIX #J3 enhancement)

                                    let parenDepth2 = 0;
                                    let closeParenIndex2 = -1;

                                    for (let i = lastOpenParen2; i < fullQuery.length && i <= cursorOffset; i++) {
                                        if (fullQuery[i] === '(') parenDepth2++;
                                        else if (fullQuery[i] === ')') {
                                            parenDepth2--;
                                            if (parenDepth2 === depthAtLastOpenParen2) {
                                                closeParenIndex2 = i;
                                                break;
                                            }
                                        }
                                    }

                                    if (closeParenIndex2 >= 0 && closeParenIndex2 < cursorOffset) {
                                        const textAfterCloseParen2 = fullQuery.substring(closeParenIndex2, cursorOffset);

                                        // Match pattern ") alias WHERE" etc. - full match first
                                        let detectedClause: string | null = null;

                                        const outerClausePatternFull2 = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|JOIN)\b/i.exec(textAfterCloseParen2);

                                        if (outerClausePatternFull2) {
                                            detectedClause = outerClausePatternFull2[2].toUpperCase().replace(/\s+/g, ' ');

                                            if (detectedClause === 'JOIN') detectedClause = 'FROM';
                                        } else {
                                            // FIX #J2-v2: Prefix matching for partial input (e.g., " T WH" -> WHERE)
                                            const outerClausePrefixPattern2 = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WH|GR\s*|HA|OR|JO)/i.exec(textAfterCloseParen2);

                                            if (outerClausePrefixPattern2) {
                                                const prefix = outerClausePrefixPattern2[2].toUpperCase().replace(/\s+/, '');

                                                if (prefix.startsWith('WH')) detectedClause = 'WHERE';
                                                else if (prefix.startsWith('GR')) detectedClause = 'GROUP BY';
                                                else if (prefix === 'HA') detectedClause = 'HAVING';
                                                else if (prefix.startsWith('OR')) detectedClause = 'ORDER BY';
                                                else if (prefix.startsWith('JO')) detectedClause = 'FROM';
                                            }
                                        }

                                        if (detectedClause) {
                                            currentClause = detectedClause;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (!overrideToSelectOnly) {
                        currentClause = caseFoundWithoutEnd ? null : 'FROM';
                    }

                    // FIX #J3: Outer clause detection after subquery closing paren + alias pattern
                    // (benchmark branch-2 는 branch-1 의 lastOpenParenIndex 를 참조 - 함수 스코프 승격 + 가드)
                    if (!overrideToSelectOnly && currentClause === 'FROM' && lastOpenParenIndex >= 0) {
                        const textFromLastParen = fullQuery.substring(lastOpenParenIndex);

                        let parenDepth = 0;
                        let closeParenIndex = -1;

                        for (let i = 0; i < textFromLastParen.length; i++) {
                            if (textFromLastParen[i] === '(') parenDepth++;
                            else if (textFromLastParen[i] === ')') {
                                parenDepth--;
                                if (parenDepth === 0) {
                                    closeParenIndex = lastOpenParenIndex + i;
                                    break;
                                }
                            }
                        }

                        if (closeParenIndex >= 0 && closeParenIndex < cursorOffset) {
                            const textAfterCloseParen = fullQuery.substring(closeParenIndex, cursorOffset);

                            // First try complete keyword match
                            let detectedClause2: string | null = null;

                            const outerClausePatternFull = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP BY|HAVING|ORDER BY)\b/i.exec(textAfterCloseParen);

                            if (outerClausePatternFull) {
                                detectedClause2 = outerClausePatternFull[2].toUpperCase();
                            } else {
                                // FIX #J2-v2: Prefix matching for partial input (e.g., " T WH" -> WHERE)
                                const outerClausePrefixPattern = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WH|GR|HA|OR)/i.exec(textAfterCloseParen);

                                if (outerClausePrefixPattern) {
                                    const prefix = outerClausePrefixPattern[2].toUpperCase();

                                    if (prefix.startsWith('WH')) detectedClause2 = 'WHERE';
                                    else if (prefix.startsWith('GR')) detectedClause2 = 'GROUP BY';
                                    else if (prefix === 'HA') detectedClause2 = 'HAVING';
                                    else if (prefix.startsWith('OR')) detectedClause2 = 'ORDER BY';
                                }
                            }

                            if (detectedClause2) {
                                currentClause = detectedClause2;
                            }
                        }
                    }
                } else {
                    // Cursor is inside the FROM keyword (e.g., at 'F'/'R'/'O'/'M')
                    // FIX O156-v2: If the text before FROM ends with '.' (e.g. "SELECT T.\nFROM"),
                    // the user is typing a column prefix (alias-dot pending) -> column suggestions, not FROM.
                    const fromPosForDotCheck = latestFromAfterLatestSelect >= 0 ? latestFromAfterLatestSelect : (contextInfo.fromPos >= 0 ? contextInfo.fromPos : cursorOffset);
                    const textBeforeFromForDot = fullQuery.substring(0, fromPosForDotCheck);
                    if (/\.\s*$/.test(textBeforeFromForDot) && fromPosForDotCheck < cursorOffset) {
                        currentClause = null;
                    } else {
                        currentClause = 'FROM';
                    }
                }
            } else {
                // Cursor before FROM, so SELECT-only
                currentClause = null;
            }
        } else if (latestSelectAtDepth >= 0) {
            // Found SELECT but no subsequent FROM at this depth in textBeforeCursor
            // CHECK: Is there a new line followed by FROM right after cursor?

            const textAfterCursor = fullQuery.substring(cursorOffset);

            // FIX #J2: Nested query check BEFORE accepting newline+FROM pattern (depth-aware)
            let isNestedSelectOnly = false;
            const textBeforeCursorCheck3 = fullQuery.substring(0, cursorOffset);
            const lastOpenParen3 = textBeforeCursorCheck3.lastIndexOf('(');

            if (lastOpenParen3 >= 0) {
                // Calculate depth at the opening paren position
                let depthAtLastOpenParen3 = 0;
                for (let i = 0; i < lastOpenParen3 && i < fullQuery.length; i++) {
                    if (fullQuery[i] === '(') depthAtLastOpenParen3++;
                    else if (fullQuery[i] === ')') depthAtLastOpenParen3--;
                }

                const subqueryDepth3 = depthAtLastOpenParen3 + 1;

                // Only apply nested query check if cursor is actually inside this subquery at its depth
                if (cursorOffset > lastOpenParen3 && cursorDepth >= subqueryDepth3) {
                    const textInsideSubquery3 = fullQuery.substring(lastOpenParen3 + 1, cursorOffset);

                    // Check: has SELECT inside subquery but no FROM after it
                    const selectMatch3 = /\bSELECT\s/i.exec(textInsideSubquery3);

                    if (selectMatch3) {
                        const selectPos3 = selectMatch3.index;
                        const searchTextText3 = selectMatch3[0].length;

                        const textAfterSelectBeforeCursor3 = textInsideSubquery3.substring(selectPos3 + searchTextText3);

                        if (!/\bFROM\b/.test(textAfterSelectBeforeCursor3)) {
                            isNestedSelectOnly = true;
                        } else {
                            // There IS a FROM - check for outer clause (FIX #J3 enhancement)

                            let parenDepth3 = 0;
                            let closeParenIndex3 = -1;

                            for (let i = lastOpenParen3; i < fullQuery.length && i <= cursorOffset; i++) {
                                if (fullQuery[i] === '(') parenDepth3++;
                                else if (fullQuery[i] === ')') {
                                    parenDepth3--;
                                    if (parenDepth3 === depthAtLastOpenParen3) {
                                        closeParenIndex3 = i;
                                        break;
                                    }
                                }
                            }

                            if (closeParenIndex3 >= 0 && closeParenIndex3 < cursorOffset) {
                                const textAfterCloseParen3 = fullQuery.substring(closeParenIndex3, cursorOffset);

                                // Match pattern: ") alias clause"
                                const outerClausePattern3 = /\)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|JOIN)\b/i.exec(textAfterCloseParen3);

                                if (outerClausePattern3) {
                                    currentClause = outerClausePattern3[2].toUpperCase().replace(/\s+/g, ' ');

                                    // Handle JOIN specially - it's part of FROM clause context
                                    if (currentClause === 'JOIN') {
                                        currentClause = 'FROM';
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Look for newline(s) and then FROM keyword immediately
            if (!isNestedSelectOnly) {  // Only check if not already overridden
                const newlineMatch = textAfterCursor.match(/^[\r\n\s]+/i);
                if (newlineMatch) {
                    const afterNewlines = textAfterCursor.substring(newlineMatch[0].length);
                    if (/^(?:FROM)\b/i.test(afterNewlines)) {
                        // Found: SELECT + newline(s) + FROM → treat as FROM clause
                        currentClause = 'FROM';
                    } else {
                        // No FROM after newlines → still in SELECT
                        currentClause = null;
                    }
                } else {
                    // No newline at all → definitely SELECT-only
                    currentClause = null;
                }
            } else {
                // nested query override took precedence - already SELECT-only
                currentClause = null;
            }
        }

        // CRITICAL FIX: Check for unfinished CASE expression BEFORE accepting FROM clause
        if (currentClause === 'FROM') {
            const textBeforeCursorOrFrom = fullQuery.substring(0, Math.min(cursorOffset, contextInfo.fromPos + 5));

            // Check for CASE keyword (ignoring string literals)
            let inStringLiteralCaseCheck = false;

            let hasCASE = false;
            for (let i = 0; i < textBeforeCursorOrFrom.length - 3; i++) {
                const char = textBeforeCursorOrFrom[i];
                if (!inStringLiteralCaseCheck && char === "'") {
                    if (i === 0 || textBeforeCursorOrFrom[i - 1] !== '\\') {
                        inStringLiteralCaseCheck = true;
                    }
                } else if (inStringLiteralCaseCheck && char === "'" && textBeforeCursorOrFrom[i - 1] !== '\\') {
                    inStringLiteralCaseCheck = false;
                } else if (!inStringLiteralCaseCheck) {
                    const remainingText = textBeforeCursorOrFrom.substring(i).toUpperCase();
                    if (/^CASE\b/.test(remainingText)) {
                        hasCASE = true;
                        break;
                    }
                }
            }

            // If has CASE, check for END (ignoring string literals)
            let hasENDpattern = false;
            if (hasCASE) {
                inStringLiteralCaseCheck = false;
                for (let i = 0; i < textBeforeCursorOrFrom.length - 2; i++) {
                    const char = textBeforeCursorOrFrom[i];
                    if (!inStringLiteralCaseCheck && char === "'") {
                        if (i === 0 || textBeforeCursorOrFrom[i - 1] !== '\\') {
                            inStringLiteralCaseCheck = true;
                        }
                    } else if (inStringLiteralCaseCheck && char === "'" && textBeforeCursorOrFrom[i - 1] !== '\\') {
                        inStringLiteralCaseCheck = false;
                    } else if (!inStringLiteralCaseCheck) {
                        const remainingTextToEnd = textBeforeCursorOrFrom.substring(i).toUpperCase();
                        if (/^END\b/.test(remainingTextToEnd)) {
                            hasENDpattern = true;
                            break;
                        }
                    }
                }
            }

            if (hasCASE && !hasENDpattern) {
                currentClause = null;  // Still inside CASE expression
            }
        }
    }

    // Oracle 특이 문법 처리 - Find keyword where cursor is IN or AFTER it (not before)
    const keywordsAtDepth: { name: string; startPos: number; endPos: number }[] = [];

    if (contextInfo.startWithPos >= 0 && contextInfo.lastStartWithDepth === cursorDepth) {
        const swEnd = contextInfo.startWithPos + 10; // "START WITH" length (10 chars: S-T-A-R-T- -W-I-T-H)
        keywordsAtDepth.push({
            name: 'START WITH',
            startPos: contextInfo.startWithPos,
            endPos: swEnd
        });
    }

    if (contextInfo.connectByPos >= 0 && contextInfo.lastConnectByDepth === cursorDepth) {
        const cbEnd = contextInfo.connectByPos + 10; // "CONNECT BY" length
        keywordsAtDepth.push({
            name: 'CONNECT BY',
            startPos: contextInfo.connectByPos,
            endPos: cbEnd
        });
    }

    if (keywordsAtDepth.length > 0) {
        // Find the keyword where cursor is IN it or just after it started typing
        const activeKeyword = keywordsAtDepth.find(kw =>
            cursorOffset >= kw.startPos && cursorOffset <= kw.endPos + 2  // Allow 2 chars buffer for space
        );

        if (activeKeyword) {
            currentClause = activeKeyword.name;
        } else {
            const completedKeywords = keywordsAtDepth.filter(kw => cursorOffset > kw.endPos + 2);
            let lastCompleted: { name: string; startPos: number; endPos: number } | null = null;
            for (const kw of completedKeywords) {
                if (lastCompleted === null || kw.startPos > lastCompleted.startPos) {
                    lastCompleted = kw;
                }
            }

            if (lastCompleted !== null && lastCompleted.startPos >= 0) {
                currentClause = lastCompleted.name;
            }
        }
    }

    // PIVOT/UNPIVOT 처리
    if (contextInfo.pivotPos >= 0 && contextInfo.pivotPos < cursorOffset) {
        // PIVOT 내부 확인
        const pivotText = fullQuery.substring(contextInfo.pivotPos, Math.min(contextInfo.pivotPos + 50, fullQuery.length));
        if (pivotText.includes('PIVOT')) currentClause = 'PIVOT';
    } else if (contextInfo.unpivotPos >= 0 && contextInfo.unpivotPos < cursorOffset) {
        const unpivotText = fullQuery.substring(contextInfo.unpivotPos, Math.min(contextInfo.unpivotPos + 50, fullQuery.length));
        if (unpivotText.includes('UNPIVOT')) currentClause = 'UNPIVOT';
    }

    return {
        currentClause,
        lastSelectIdx: contextInfo.selectPos,
        lastFromIdx: contextInfo.fromPos,
        lastWhereIdx: contextInfo.wherePos,
        lastGroupByIdx: contextInfo.groupByPos,
        lastOrderByIdx: contextInfo.orderByPos,
        lastHavingIdx: contextInfo.havingPos,
        lastConnectByIdx: contextInfo.connectByPos,
        lastStartWithIdx: contextInfo.startWithPos
    };
}

/**
 * FROM 절 이후 WHERE/GROUP BY 이전에 있는 텍스트 추출
 */
export function extractFROMClauseContent(upperText: string): string | null {
    // 문자열 리터럴/주석 안의 'FROM' 등 키워드가 오염시키지 않도록 마스킹 (v10.40)
    const masked = maskNonSqlText(upperText);
    const fromMatch = masked.match(/FROM\s+([\s\S]+)/i);

    if (!fromMatch?.[1]) return null;

    // WHERE, GROUP BY, ORDER BY, HAVING 같은 다음 키워드까지 잘라내기
    const withoutClauses = fromMatch[1].split(/\s+(?:WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i)[0];

    return withoutClauses?.trim() || null;
}