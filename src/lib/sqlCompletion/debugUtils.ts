/**
 * SQL 자동완성 디버깅 유틸리티
 * Debug logging 전용 모듈 (프로덕션에서는 비활성화 가능)
 */

interface NestedContextInfo {
    isNested: boolean;
    currentSelectInfo?: {
        pos: number;
        depth: number;
        selectText: string;
    } | null;
}

/**
 * 현재 parentheses 깊이 계산 (옵션: 커서 위치까지만 계산)
 */
export function calculateParenDepth(text: string, cursorOffset?: number): number {
    const textToAnalyze = cursorOffset !== undefined ? 
        text.substring(0, Math.min(cursorOffset + 1, text.length)) : 
        text;
    
    let parenDepth = 0;
    
    for (let i = 0; i < textToAnalyze.length; i++) {
        if (textToAnalyze[i] === '(') parenDepth++;
        else if (textToAnalyze[i] === ')') parenDepth--;
    }
    
    return Math.max(0, parenDepth);
}

/**
 * 중첩 쿼리에서 SELECT 위치 정보 추출 (옵션: 커서 위치까지만 분석)
 */
export function findSelectPositions(text: string, cursorOffset?: number): Array<{pos: number; depth: number}> {
    const textToAnalyze = cursorOffset !== undefined ? 
        text.substring(0, Math.min(cursorOffset + 1, text.length)) : 
        text;
    
    const selectPositions = [];
    const upperText = textToAnalyze.toUpperCase();
    
    for (let idx = 0; idx < upperText.length - 6; idx++) {
        if (/SELECT\b/.test(upperText.substring(idx))) {
            let depthAtSelect = calculateParenDepth(textToAnalyze, idx);
            selectPositions.push({ 
                pos: idx, 
                depth: depthAtSelect 
            });
        }
    }
    
    return selectPositions;
}

/**
 * 현재 속한 SELECT 범위 찾기
 */
export function findCurrentSelectInfo(
    textBeforeCursor: string,
    parenDepth: number
): {pos: number; depth: number; selectText: string} | null {
    const selectPositions = findSelectPositions(textBeforeCursor);
    const currentSelectInfo = selectPositions
        .filter(s => s.depth === parenDepth)
        .sort((a, b) => b.pos - a.pos)[0];

    if (!currentSelectInfo) return null;
    
    return {
        ...currentSelectInfo,
        selectText: textBeforeCursor.substring(currentSelectInfo.pos)
    };
}

/**
 * 중첩 쿼리 컨텍스트 로깅
 */
export function logNestedContext(
    textBeforeCursor: string,
    currentClause: string | null,
    lastFromIdx: number,
    aliasToTableName: Record<string, string>
) {
    console.log('='.repeat(70));
    console.log('[COMPLETION] NESTED CONTEXT CHECK');
    console.log(`  textBeforeCursor: ...${textBeforeCursor.substring(Math.max(0, textBeforeCursor.length - 200))}`);
    console.log(`  currentClause: ${currentClause}`);
    console.log(`  lastFromIdx: ${lastFromIdx}`);
    
    const parenDepth = calculateParenDepth(textBeforeCursor);
    console.log(`  현재 parentheses 깊이: ${parenDepth}`);
    
    const selectPositions = findSelectPositions(textBeforeCursor);
    if (selectPositions.length > 0) {
        console.log(`  발견된 SELECT 위치들: ${selectPositions.map(s => `(pos:${s.pos}, depth:${s.depth})`).join(', ')}`);
    } else {
        console.log('  발견된 SELECT 절 없음');
    }
    
    const isNestedQuery = parenDepth > 0;
    const currentSelectInfo = findCurrentSelectInfo(textBeforeCursor, parenDepth);
    
    console.log(`  Nested query 여부: ${isNestedQuery}`);
    
    if (currentSelectInfo) {
        console.log(`  현재 속한 SELECT 의 위치: ${currentSelectInfo.pos}, 깊이: ${currentSelectInfo.depth}`);
        const truncatedText = currentSelectInfo.selectText.length > 100 
            ? `${currentSelectInfo.selectText.substring(0, 50)}...`
            : currentSelectInfo.selectText;
        console.log(`  현재 SELECT 쿼리 세그먼트: "${truncatedText}"`);
    }
    
    if (Object.keys(aliasToTableName).length > 0) {
        console.log(`  사용 가능한 aliases: ${Object.entries(aliasToTableName)
            .map(([alias, table]) => `${alias} -> ${table}`)
            .join(', ')}`);
    } else {
        console.log('  사용 가능한 alias 없음');
    }
}
