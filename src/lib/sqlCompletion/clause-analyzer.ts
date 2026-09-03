/**
 * SQL 절 (Clause) 위치 분석 및 현재 절 감지 유틸리티  
 */

import type { ParsingResult, CteDefinition } from './types';

/**
 * 텍스트 내에서 unfinished CASE 식 검출
 * FROM 의 경우만 문자 리터럴을 올바르게 처리하여 END 패턴 체크
 */
function checkUnfinishedCaseAtCurrentDepth(text: string): boolean {
    // 1. 문자 리터럴을 무시하고 CASE 키워드 찾기
    let inString = false;
    let casePosition = -1;
    
    for (let i = 0; i < text.length - 3; i++) {
        if (!inString && text[i] === "'") {
            // 문자 리터럴 시작 (앞에 escape 문자가 없으면)
            if (i === 0 || text[i - 1] !== '\\') {
                inString = true;
            }
        } else if (inString && text[i] === "'" && text[i - 1] !== '\\') {
            // 문자 리터럴 끝
            inString = false;
        } else if (!inString) {
            const remainingText = text.substring(i).toUpperCase();
            if (/^CASE\b/.test(remainingText)) {
                casePosition = i;
                break;  // 첫 번째 CASE 만 찾으면 됨
            }
        }
    }
    
    if (casePosition === -1) return false;  // CASE 가 없음 → finished
    
    // 2. CASE 를 찾았으니, CASE 이후 to end 의 텍스트에서 END 가 있는지 확인 (문자 리터럴 무시)
    inString = false;
    for (let i = casePosition; i < text.length - 2; i++) {
        if (!inString && text[i] === "'") {
            // 문자 리터럴 시작
            if (i === 0 || text[i - 1] !== '\\') {
                inString = true;
            }
        } else if (inString && text[i] === "'" && text[i - 1] !== '\\') {
            // 문자 리터럴 끝
            inString = false;
        } else if (!inString) {
            const remainingTextToEnd = text.substring(i).toUpperCase();
            if (/^END\b/.test(remainingTextToEnd)) {
                return false;  /* END 를 찾음 → finished CASE */
            }
        }
    }
    
    // 3. 끝까지 (END 를 찾지 못하면 unfinished CASE 
    return true;
}


/**
 * Parentheses 깊이를 추적하면서 키워드 찾기
 * 커서 직전까지의 텍스트에서, 현재 parentheses 깊이 내의 마지막 키워드 위치를 찾음
 */
export interface KeywordWithContextInfo {
    selectPos: number;
    fromPos: number;
    wherePos: number;
    groupByPos: number;
    orderByPos: number;
    havingPos: number;  // NEW: HAVING 절 추가
    withPos: number;  // NEW: WITH 키워드 위치
    lastOnPos: number;  // NEW: 마지막 ON 키워드 위치 (JOIN ... ON)
    cteDefinitions: CteDefinition[];  // NEW: 추출된 CTE 목록
    currentDepth: number;           // 커서 위치의 parentheses 깊이
    lastSelectDepth: number;       // 마지막 SELECT 의 깊이
    lastFromDepth: number;         // 마지막 FROM 의 깊이
    lastWhereDepth: number;        // 마지막 WHERE 의 깊이
    lastGroupByDepth: number;      // 마지막 GROUP BY 의 깊이
    lastOrderByDepth: number;      // 마지막 ORDER BY 의 깊이
    lastHavingDepth: number;       // NEW: 마지막 HAVING 의 깊이
    lastWithDepth: number;         // NEW: 마지막 WITH 의 깊이
    lastOnDepth: number;           // NEW: 마지막 ON 의 깊이
}

/**
 * 텍스트 전역에서 모든 키워드 위치와 해당 parentheses 깊이 기록
 * Line endings(\r\n, \r) 를 정규화하여 정확하게 파싱
 */
export function findKeywordsWithContext(text: string): KeywordWithContextInfo {
    // Line ending 정규화: \r\n → \n, 나머지 \r → \n
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const upperText = normalizedText.toUpperCase();

    let selectPos = -1, fromPos = -1, wherePos = -1, groupByPos = -1, orderByPos = -1, havingPos = -1;
    let lastSelectDepth = -1, lastFromDepth = -1, lastWhereDepth = -1, lastGroupByDepth = -1, lastOrderByDepth = -1, lastHavingDepth = -1;
    let withPos = -1, lastWithDepth = -1;
    let lastOnPos = -1, lastOnDepth = -1;  // NEW: ON 키워드 추적 추가
    let cteDefinitions: CteDefinition[] = [];
    let currentDepth = 0;

    // Helper function to extract CTE definitions from WITH clause
    const extractCteDefinitions = (text: string, startFrom: number): void => {
        const withSegment = text.substring(startFrom);
        const withMatch = withSegment.match(/^\s*WITH\s+([\s\S]+?)(?:\s+SELECT\b)/i);
        
        if (!withMatch?.[1]) return;
        
        const cteSegment = withMatch[1];
        // Split by comma but respect parentheses nesting
        let parenDepth = 0;
        let currentCte = '';
        
        for (let i = 0; i < cteSegment.length; i++) {
            const char = cteSegment[i];
            if (char === '(') parenDepth++;
            else if (char === ')') parenDepth--;
            
            if (char === ',' && parenDepth === 0) {
                // End of CTE definition
                const trimmedCte = currentCte.trim();
                const nameMatch = trimmedCte.match(/^(\w+)\s+AS\s*\(/i);
                if (nameMatch?.[1]) {
                    cteDefinitions.push({
                        name: nameMatch[1].toUpperCase(),
                        position: startFrom + 5 // WITH keyword length
                    });
                }
                currentCte = '';
            } else {
                currentCte += char;
            }
        }
        
        // Last CTE (no trailing comma)
        const trimmedCte = currentCte.trim();
        const nameMatch = trimmedCte.match(/^(\w+)\s+AS\s*\(/i);
        if (nameMatch?.[1]) {
            cteDefinitions.push({
                name: nameMatch[1].toUpperCase(),
                position: startFrom + 5
            });
        }
    };

    // 정규화된 텍스트 한 글자씩 순회하면서 parentheses 깊이 추적 + 키워드 찾기
    for (let i = 0; i < normalizedText.length; i++) {
        const char = normalizedText[i];

        if (char === '(') {
            currentDepth++;
        } else if (char === ')') {
            currentDepth = Math.max(0, currentDepth - 1);
        }

        // 키워드 찾기: 공백/\n/\r 무시, 정확한 단어만 매칭
        const remainingText = normalizedText.substring(i);

        // WITH keyword handling (must be before SELECT to catch CTE patterns)
        if (/^(?:\s|[\r\n])*WITH(?=\s|[\r\n]|$)/i.test(remainingText)) {
            withPos = i;
            lastWithDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*WITH/i);
            if (keywordMatch) {
                extractCteDefinitions(remainingText, i + keywordMatch[0].length);
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*SELECT(?=\s|[\r\n]|$)/i.test(remainingText)) {
            selectPos = i;
            lastSelectDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*SELECT/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*FROM(?=\s|[\r\n]|$)/i.test(remainingText)) {
            fromPos = i;
            lastFromDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*FROM/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*WHERE(?=\s|[\r\n]|$)/i.test(remainingText)) {
            wherePos = i;
            lastWhereDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*WHERE/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*GROUP\s+BY(?=\s|[\r\n]|$)/i.test(remainingText)) {
            groupByPos = i;
            lastGroupByDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*GROUP\s+BY/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*HAVING(?=\s|[\r\n]|$)/i.test(remainingText)) {
            // NEW: HAVING 추가
            havingPos = i;
            lastHavingDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*HAVING/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*ORDER\s+BY(?=\s|[\r\n]|$)/i.test(remainingText)) {
            orderByPos = i;
            lastOrderByDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*ORDER\s+BY/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(?:\s|[\r\n])*ON(?=\s|[\r\n]|$)/i.test(remainingText)) {
            // NEW: ON 키워드 추적 추가 (JOIN ... ON)
            lastOnPos = i;
            lastOnDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s)*ON/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        }
    }

    // 마지막 깊이가 현재 커서의 깊이 (정규화된 텍스트 사용)
    currentDepth = 0;
    for (let i = 0; i < normalizedText.length; i++) {
        if (normalizedText[i] === '(') currentDepth++;
        else if (normalizedText[i] === ')') currentDepth = Math.max(0, currentDepth - 1);
    }

    return {
        selectPos, fromPos, wherePos, groupByPos, orderByPos, havingPos, withPos, lastOnPos, cteDefinitions,  // NEW: lastOnPos 추가
        currentDepth, lastSelectDepth, lastFromDepth, lastWhereDepth, lastGroupByDepth, lastOrderByDepth, lastHavingDepth, lastWithDepth, lastOnDepth  // NEW: lastOnDepth 추가
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
 * 쿼리 텍스트에서 SELECT, FROM, WHERE, GROUP BY 의 위치를 찾아분석
 * Nested query 를 고려하여 현재 parentheses 깊이 내에서 가장 최근 절만 추적
 * @param fullQuery - 전체 쿼리 텍스트  
 * @param cursorOffset - 커서 위치 (offset)
 */
export function analyzeSQLClauses(fullQuery: string, cursorOffset: number = fullQuery.length): ParsingResult {
    // Line ending 정규화 (findKeywordsWithContext 와 동일한 패턴 사용)
    const normalizedText = fullQuery.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // NEW: 전체 쿼리를 분석하여 모든 키워드 위치 확보 (not just textBeforeCursor!)  
    const contextInfo = findKeywordsWithContext(fullQuery);

    // cursorPosition 에서의 깊이를 따로 계산
    let cursorDepth = 0;
    for (let i = 0; i < cursorOffset && i < fullQuery.length; i++) {
        if (fullQuery[i] === '(') cursorDepth++;
        else if (fullQuery[i] === ')') cursorDepth = Math.max(0, cursorDepth - 1);
    }

    // 현재 깊이에서 가장 최근 절 찾기 (ON 은 절로 취급하지 않음 - null 반환)
    let currentClause: string | null = null;

    // NEW: sameDepthKeywords 에 HAVING 추가 + 절 순서대로 정렬
    const sameDepthKeywords: { name: string; pos: number; depth: number }[] = [
        { name: 'HAVING', pos: contextInfo.havingPos, depth: contextInfo.lastHavingDepth },  // NEW: HAVING 추가 (GROUP BY 다음)
        { name: 'WHERE', pos: contextInfo.wherePos, depth: contextInfo.lastWhereDepth },
        { name: 'GROUP_BY', pos: contextInfo.groupByPos, depth: contextInfo.lastGroupByDepth },
        { name: 'ORDER_BY', pos: contextInfo.orderByPos, depth: contextInfo.lastOrderByDepth },
        { name: 'FROM', pos: contextInfo.fromPos, depth: contextInfo.lastFromDepth },
    ];

    // 같은 깊이에서 cursor BEFORE 에 있는 키워드 중 가장 최근 찾기  
    const validClauses = sameDepthKeywords.filter(k => 
        k.pos >= 0 && 
        k.depth === cursorDepth && 
        k.pos < cursorOffset  // NEW: keyword 가 cursor 뒤에 있으면 안 됨
    );

    const recentInSameDepth = validClauses.length > 0 
        ? validClauses.sort((a, b) => b.pos - a.pos)[0] 
        : null;

    // ==========================================
    // FIX #56: HAVING → ORDER BY boundary 조건 개선
    // 사용자 입력 패턴 "HAVING   \nORDER BY"에서 
    // 커서가 HAVING content area 에 있어도 ORDER BY 로 잘못 감지되는 문제 해결
    // ==========================================
    let correctedRecentClause = recentInSameDepth;
    
    if (recentInSameDepth) {
        const clauseStartPos = recentInSameDepth.pos;
        const clauseEndPos = clauseStartPos + getClauseKeywordLength(recentInSameDepth.name);
        
        if (clauseEndPos < cursorOffset && recentInSameDepth.name === "HAVING") {
            const textFromHavingToCursor = normalizedText.substring(clauseEndPos, cursorOffset);
            
            if (/^(?:\s|[\r\n])*ORDER\s+BY\b/i.test(textFromHavingToCursor.trim())) {
                const orderPosition = textFromHavingToCursor.search(/^(?:\s|[\r\n])*ORDER\s+BY\b/i);
                
                if (cursorOffset < clauseEndPos + orderPosition) {
                    correctedRecentClause = { ...recentInSameDepth, name: "HAVING" };
                } else {
                    correctedRecentClause = { name: "ORDER_BY", pos: recentInSameDepth.pos, depth: cursorDepth };
                }
            }
        }
    }

    // ==========================================
    // FIX #57: Nested query outer WHERE detection 개선  
    if (!correctedRecentClause && cursorDepth === 0) {
        const textBeforeCursor = normalizedText.substring(0, cursorOffset);
        
        let lastClosingParen = -1;
        for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
            if (textBeforeCursor[i] === ")") {
                lastClosingParen = i;
                break;
            }
        }
        
        if (lastClosingParen >= 0 && lastClosingParen < cursorOffset - 1) {
            const textAfterParen = normalizedText.substring(lastClosingParen + 1, cursorOffset);
            
            if (/^(?:\s|[\r\n])*WHERE\b/i.test(textAfterParen)) {
                correctedRecentClause = { name: "WHERE", pos: lastClosingParen + 1, depth: 0 };
            }
        }
    }

    function getClauseKeywordLength(clauseName: string): number {
        switch (clauseName) {
            case "HAVING": return 6;
            case "ORDER_BY": return 8;
            case "WHERE": return 5;
            case "FROM": return 4;
            case "GROUP_BY": return 8;
            default: return clauseName.length;
        }
    }

    const recentClauseToUse = correctedRecentClause || recentInSameDepth;

    // CRITICAL FIX: ON 키워드가 가장 최근이면 null 반환 (컬럼 제안)
    if (contextInfo.lastOnPos >= 0 && contextInfo.lastOnDepth === cursorDepth && contextInfo.lastOnPos < cursorOffset) {
        const recentKeywordBeforeCursor = validClauses.length > 0 
            ? validClauses.sort((a, b) => b.pos - a.pos)[0]
            : null;
        
        // ON 키워드 길이 (2 characters: "ON")
        const onKeywordLength = 2;
        const onEndPos = contextInfo.lastOnPos + onKeywordLength;
        
        // Scenario 1: 커서가 ON 키워드 끝에서 바로 뒤이면 (JOIN ... ON|) → 컬럼 제안
        if (cursorOffset >= onEndPos && cursorOffset <= onEndPos + 3) {
            currentClause = null;
        }
        // Scenario 2: 커서가 ON 이후로 좀 더 진행되었지만 아직 최근 키워드가 ON 일 때
        else if (!recentKeywordBeforeCursor || contextInfo.lastOnPos > recentKeywordBeforeCursor.pos) {
            currentClause = null;  // ON 절 이후 → 컬럼 추천
        }
        // Scenario 3: cursor 가 past the ON keyword + space, 다른 절이 더 최근인 경우 (비정상적인 패턴)
        else if (recentKeywordBeforeCursor && contextInfo.lastOnPos < recentKeywordBeforeCursor.pos) {
            // ON 전에 다른 절이 있다면 (예: ON ... WHERE), 현재 위치의 문맥 파악
            const textAfterOn = fullQuery.substring(onEndPos, cursorOffset).toUpperCase();
            
            // 만약 WHERE, GROUP BY 같은 절 키워드가 ON 다음에 왔다면 해당 절 사용
            if (/^(?:\s|[\r\n])+(WHERE|GROUP\s+BY|ORDER\s+BY)\b/i.test(textAfterOn)) {
                const match = textAfterOn.match(/^(?:\s|[\r\n])+(WHERE|GROUP\s+BY|ORDER\s+BY)/i);
                if (match?.[1]) {
                    currentClause = match[1].replace(/\s+/, ' ').toUpperCase();
                } else {
                    // ON 다음에 다른 절 없이 계속 입력 중 → 컬럼 제안
                    currentClause = null;
                }
            } else {
                // ON 다음에 새로운 절 키워드가 없으면 still in ON condition → 컬럼 제안
                currentClause = null;
            }
        } else if (recentKeywordBeforeCursor) {
            const clauseNameMap: Record<string, string> = {
                'HAVING': 'HAVING',  // NEW: HAVING 추가
                'WHERE': 'WHERE',
                'GROUP_BY': 'GROUP BY',
                'ORDER_BY': 'ORDER BY',
                'FROM': 'FROM'
            };
            
            currentClause = clauseNameMap[recentKeywordBeforeCursor.name] || recentKeywordBeforeCursor.name;
        }
    } else {
        // NEW: 현재 깊이에 해당 키워드가 없으면, fallback 로직 개선 (CTE 지원)
        
        const textBeforeCursor = fullQuery.substring(0, cursorOffset);
        
        // Each SELECT resets the scope - find latest SELECT at current depth, then check for its FROM
        let latestSelectAtDepth = -1;
        let latestFromAfterLatestSelect = -1;
        let currentTextDepth = 0;
        
        for (let i = 0; i < textBeforeCursor.length; i++) {
            const char = textBeforeCursor[i];
            if (char === '(') {
                currentTextDepth++;
            } else if (char === ')') {
                currentTextDepth = Math.max(0, currentTextDepth - 1);
            }
            
            // Check for SELECT at current depth
            const remainingText = textBeforeCursor.substring(i);
            if (/^(?:SELECT)\b/i.test(remainingText) && currentTextDepth === cursorDepth) {
                latestSelectAtDepth = i;
                latestFromAfterLatestSelect = -1;  // Reset on new SELECT
                // Skip SELECT keyword
                const match = remainingText.match(/^(?:SELECT)/i);
                if (match) i += match[0].length - 1;
            }
            
            // Check for FROM after SELECT (at same depth)
            else if (/^(?:FROM)\b/i.test(remainingText) && currentTextDepth === cursorDepth) {
                if (latestSelectAtDepth >= 0 && i > latestSelectAtDepth) {
                    latestFromAfterLatestSelect = i;
                    const match = remainingText.match(/^(?:FROM)/i);
                    if (match) i += match[0].length - 1;
                }
            }
        }
        
        // If we found a FROM after the latest SELECT at current depth, use it
        if (latestFromAfterLatestSelect >= 0) {
            const fromKeywordLength = 4;
            const fromEndPos = latestFromAfterLatestSelect + fromKeywordLength;
            
            // Check cursor position relative to FROM keyword  
            let tentativeClause: string | null = null;
            
            if (cursorOffset > fromEndPos + 1) {
                // Cursor is past the FROM keyword - check what comes next
                const charAfterFrom = fullQuery[fromEndPos];
                const isCompleteWord = !charAfterFrom || /\s/.test(charAfterFrom);
                
                if (isCompleteWord) {
                    tentativeClause = 'FROM';
                } else {
                    tentativeClause = null;  // Incomplete FROM match
                }
            } else if (cursorOffset > latestFromAfterLatestSelect) {
                // Cursor is at or just after FROM keyword start, but before end
                const charAtCursor = fullQuery[cursorOffset];
                if (!charAtCursor || /\s/.test(charAtCursor)) {
                    tentativeClause = 'FROM';  // Safe to suggest table names
                } else {
                    tentativeClause = null;  // Still typing the keyword or invalid character
                }
            } else {
                tentativeClause = null;  // Cursor before FROM, so SELECT-only
            }

            // CRITICAL FIX: Check for unfinished CASE expression BEFORE accepting FROM clause
            if (tentativeClause === 'FROM') {
                const textBeforeCursorForCaseCheck = fullQuery.substring(0, cursorOffset);
                
                // Always check for unfinished CASE before accepting FROM  
                const hasUnfinishedCase = checkUnfinishedCaseAtCurrentDepth(textBeforeCursorForCaseCheck);
                
                if (hasUnfinishedCase) {
                    currentClause = null;  /* Still inside unfinished CASE expression */
                } else {
                    currentClause = 'FROM';
                }
            } else {
                currentClause = tentativeClause;
            }
        } else if (latestSelectAtDepth >= 0) {
            // Found SELECT but no subsequent FROM at this depth in textBeforeCursor
            // Check: is there a FROM keyword RIGHT AFTER cursor position? (user just pressed Enter after SELECT list or typed FROM)
            
            // Look ahead from cursor position, skipping whitespace/newlines - BUT also check for content before newline
            let lookAheadPos = cursorOffset;
            while (lookAheadPos < fullQuery.length && /[\s\n\r]/.test(fullQuery[lookAheadPos])) {
                lookAheadPos++;  
            }
            
            // FIXED: If we skipped whitespace and hit a non-word-character (like *), keep looking for newline then FROM
            if (!/^[A-Z0-9_]/i.test(fullQuery.substring(lookAheadPos)) && lookAheadPos > cursorOffset) {
                // Successfully skipped some whitespace, now at something like '*' or punctuation
                console.log('[절 분석] entering newline-check logic:', { cursorOffset, lookAheadPos, charAtLookahead: fullQuery[lookAheadPos] });
                
                const newLinePos = fullQuery.indexOf('\n', lookAheadPos);
                console.log('[절 분석] Looking for newline after pos', lookAheadPos, '- found at:', newLinePos);
                
                if (newLinePos > 0 && newLinePos + 3 < fullQuery.length) {
                    // There's a newline somewhere ahead
                    let fromCheckPos = newLinePos + 1;
                    while(fromCheckPos < fullQuery.length && /[\s\n\r]/.test(fullQuery[fromCheckPos])) {
                        fromCheckPos++;
                    }
                    
                    if (fromCheckPos < fullQuery.length - 3) {
                        const fromAfterNewlineMatch = fullQuery.substring(fromCheckPos).match(/^(?:FROM)\b/i);
                        
                        // Verify depth at newline position matches cursor depth
                        let depthAtNewline = 0;
                        for(let i=0; i<newLinePos && i<fullQuery.length; i++) {
                            if(fullQuery[i] === '(') depthAtNewline++;
                            else if(fullQuery[i] === ')') depthAtNewline--;
                        }
                        
                        if (fromAfterNewlineMatch && depthAtNewline === cursorDepth) {
                            currentClause = 'FROM';  // Found newline followed by FROM at same depth
                            console.log('[절 분석] Newline then FROM:', { 
                                cursorOffset, starPos: lookAheadPos, newlinePos: newLinePos, fromCheckPos, depth: depthAtNewline
                            });
                        } else {
                            currentClause = null;
                        }
                    } else {
                        currentClause = null;  // Not enough chars after newline
                    }
                } else {
                    currentClause = null;  // No newline found
                }            } else if (lookAheadPos < fullQuery.length - 3) {
                const upcomingKeywordMatch = fullQuery.substring(lookAheadPos).match(/^(?:FROM)\b/i);
                
                // Also need to check depth at the lookahead position
                let lookAheadDepth = 0;
                for (let i = 0; i < lookAheadPos && i < fullQuery.length; i++) {
                    if (fullQuery[i] === '(') lookAheadDepth++;
                    else if (fullQuery[i] === ')') lookAheadDepth = Math.max(0, lookAheadDepth - 1);
                }
                
                if (upcomingKeywordMatch && lookAheadDepth === cursorDepth) {
                    // Found FROM right after whitespace following cursor at same depth!
                    currentClause = 'FROM';  
                    
                    console.log('[절 분석] Cursor positioned before FROM keyword:', {
                        fromStart: lookAheadPos, 
                        cursorOffset,
                        upcomingKeyword: upcomingKeywordMatch[0]
                    });
                } else {
                    currentClause = null;  // No immediate FROM found or different depth → still in SELECT
                }
            } else {
                currentClause = null;  // Not enough text to be FROM
            }
        }
        
        console.log('[절 분석 - debug]', { 
            cursorOffset,
            textBeforeCursorLen: textBeforeCursor.length,
            latestSelectAtDepth,
            latestFromAfterLatestSelect,
            currentClause: currentClause || 'SELECT-only/null'
        });
    }

    return {
        currentClause,
        lastSelectIdx: contextInfo.selectPos,
        lastFromIdx: contextInfo.fromPos,
        lastWhereIdx: contextInfo.wherePos,  
        lastGroupByIdx: contextInfo.groupByPos,
        lastOrderByIdx: contextInfo.orderByPos,
        cteDefinitions: contextInfo.cteDefinitions  // NEW: CTE definitions 포함
    };
}

/**
 * FROM 절 이후 WHERE/GROUP BY 이전에 있는 텍스트 추출  
 */
export function extractFROMClauseContent(upperText: string): string | null {
    const fromMatch = upperText.match(/FROM\s+([\s\S]+)/i);
    
    if (!fromMatch?.[1]) return null;
    
    // WHERE, GROUP BY, ORDER BY, HAVING 같은 다음 키워드까지 잘라내기  
    const withoutClauses = fromMatch[1].split(/\s+(?:WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i)[0];
    
    return withoutClauses?.trim() || null;
}
