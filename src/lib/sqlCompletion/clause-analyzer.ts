/**
 * SQL 절 (Clause) 위치 분석 및 현재 절 감지 유틸리티  
 */

import type { ParsingResult } from './types';

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
    currentDepth: number;           // 커서 위치의 parentheses 깊이
    lastSelectDepth: number;       // 마지막 SELECT 의 깊이
    lastFromDepth: number;         // 마지막 FROM 의 깊이
    lastWhereDepth: number;        // 마지막 WHERE 의 깊이
    lastGroupByDepth: number;      // 마지막 GROUP BY 의 깊이
    lastOrderByDepth: number;      // 마지막 ORDER BY 의 깊이
}

/**
 * 텍스트 전역에서 모든 키워드 위치와 해당 parentheses 깊이 기록
 */
export function findKeywordsWithContext(text: string): KeywordWithContextInfo {
    const upperText = text.toUpperCase();

    let selectPos = -1, fromPos = -1, wherePos = -1, groupByPos = -1, orderByPos = -1;
    let lastSelectDepth = -1, lastFromDepth = -1, lastWhereDepth = -1, lastGroupByDepth = -1, lastOrderByDepth = -1;
    let currentDepth = 0;

    // 텍스트 한 글자씩 순회하면서 parentheses 깊이 추적 + 키워드 찾기
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '(') {
            currentDepth++;
        } else if (char === ')') {
            currentDepth = Math.max(0, currentDepth - 1);
        }

        // 키워드 찾기 (문자열 끝에서 시작되는지 확인)
        // SELECT 키워드: (^|[whitespace])SELECT([whitespace]|$)
        const remainingText = text.substring(i);

        if (/^(\s|\n|\r)*SELECT(\s|\n|\r|$)/i.test(remainingText)) {
            selectPos = i;
            lastSelectDepth = currentDepth;
            // 키워드 길이만큼 skip (6 자: SELECT)
            const keywordMatch = remainingText.match(/^(?:\s+|[\n\r]+)?SELECT/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;  // -1 이므로 for loop 의 ++ 과 합쳐짐
            }
        } else if (/^(\s|\n|\r)*FROM(\s|\n|\r|$)/i.test(remainingText)) {
            fromPos = i;
            lastFromDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s+|[\n\r]+)?FROM/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(\s|\n|\r)*WHERE(\s|\n|\r|$)/i.test(remainingText)) {
            wherePos = i;
            lastWhereDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s+|[\n\r]+)?WHERE/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(\s|\n|\r)*GROUP\s+BY(\s|\n|\r|$)/i.test(remainingText)) {
            groupByPos = i;
            lastGroupByDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s+|[\n\r]+)?GROUP\s+BY/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        } else if (/^(\s|\n|\r)*ORDER\s+BY(\s|\n|\r|$)/i.test(remainingText)) {
            orderByPos = i;
            lastOrderByDepth = currentDepth;
            const keywordMatch = remainingText.match(/^(?:\s+|[\n\r]+)?ORDER\s+BY/i);
            if (keywordMatch) {
                i += keywordMatch[0].length - 1;
            }
        }
    }

    // 마지막 깊이가 현재 커서의 깊이
    currentDepth = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') currentDepth++;
        else if (text[i] === ')') currentDepth = Math.max(0, currentDepth - 1);
    }

    return {
        selectPos, fromPos, wherePos, groupByPos, orderByPos,
        currentDepth, lastSelectDepth, lastFromDepth, lastWhereDepth, lastGroupByDepth, lastOrderByDepth
    };
}

/**
 * 문자열 내 키워드 위치 찾기 (공백, 줄바꿈 무시, 정확히 단어만 매칭)  - 기존 함수 유지 (호환성용)
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
 */
export function analyzeSQLClauses(textBeforeCursor: string): ParsingResult {
    const upperText = textBeforeCursor.toUpperCase();

    // 새로운 방식: parentheses 깊이 고려
    const contextInfo = findKeywordsWithContext(textBeforeCursor);

    // 현재 깊이에서 가장 최근 절 찾기 (깊이가 같거나 바깥쪽이어도 되지만, 현재 깊이의 키워드가 우선)
    let currentClause: string | null = null;

    // 같은 깊이에서 마지막 키워드 찾기 우선 순위: WHERE > GROUP BY > ORDER BY > FROM > SELECT
    const sameDepthKeywords: { name: string; pos: number; depth: number }[] = [
        { name: 'WHERE', pos: contextInfo.wherePos, depth: contextInfo.lastWhereDepth },
        { name: 'GROUP_BY', pos: contextInfo.groupByPos, depth: contextInfo.lastGroupByDepth },
        { name: 'ORDER_BY', pos: contextInfo.orderByPos, depth: contextInfo.lastOrderByDepth },
        { name: 'FROM', pos: contextInfo.fromPos, depth: contextInfo.lastFromDepth },
    ];

    // 같은 깊이에서 가장 최근 키워드 찾기
    const recentInSameDepth = sameDepthKeywords
        .filter(k => k.pos >= 0 && k.depth === contextInfo.currentDepth)
        .sort((a, b) => b.pos - a.pos)[0];

    if (recentInSameDepth) {
        // NAME 필드를 실제 절 이름으로 매핑 (GROUP_BY -> GROUP BY)
        const clauseNameMap: Record<string, string> = {
            'WHERE': 'WHERE',
            'GROUP_BY': 'GROUP BY',
            'ORDER_BY': 'ORDER BY',
            'FROM': 'FROM'
        };
        currentClause = clauseNameMap[recentInSameDepth.name] || recentInSameDepth.name;
    } else {
        // 현재 깊이에 해당 키워드가 없으면, 바깥쪽 깊이에서 찾은 것으로 fallback
        // 하지만 SELECT 만 있는 경우 예외 처리
        const lastFrom = contextInfo.fromPos >= 0 && contextInfo.lastFromDepth === contextInfo.currentDepth;
        if (lastFrom && contextInfo.fromPos > contextInfo.selectPos) {
            currentClause = 'FROM';
        } else if (!recentInSameDepth) {
            // 현재 깊이에 FROM/WHERE/GROUP BY 가 없으면 SELECT-only
            currentClause = null;  // 이 경우 index.ts 에서 `!currentClause` 로 처리해 SELECT-only 모드 진입
        }
    }

    // 디버그 로그
    console.log(' 절 위치 분석 (nested-aware):', { 
        SELECT: `위치 ${contextInfo.selectPos} (depth ${contextInfo.lastSelectDepth})`,  
        FROM: `위치 ${contextInfo.fromPos} (depth ${contextInfo.lastFromDepth})`,
        WHERE: `위치 ${contextInfo.wherePos} (depth ${contextInfo.lastWhereDepth})`,
        ORDER_BY: contextInfo.orderByPos >= 0 ? `위치 ${contextInfo.orderByPos} (depth ${contextInfo.lastOrderByDepth})` : null,
        현재_깊이: contextInfo.currentDepth,
        lastGroupBy: contextInfo.groupByPos >= 0 ? `위치 ${contextInfo.groupByPos} (depth ${contextInfo.lastGroupByDepth})` : null
    });
    console.log('[DEBUG] 현재 절:', currentClause);

    return {
        currentClause,
        lastSelectIdx: contextInfo.selectPos,
        lastFromIdx: contextInfo.fromPos,
        lastWhereIdx: contextInfo.wherePos,
        lastGroupByIdx: contextInfo.groupByPos,
        lastOrderByIdx: contextInfo.orderByPos
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
