/**
 * SQL 단어 추출 유틸리티
 * 커서 앞의 단어를 다양한 방법으로 추출
 */

interface WordExtractionResult {
    currentWord: string;
    extractedFromFallback?: boolean;
}

/**
 * Monaco 가 제공한 단어, fallback 로직 포함 추출
 */
export function extractCurrentWord(
    word: any,
    textBeforeCursor: string
): WordExtractionResult {
    const currentWordUpper = word?.word ? word.word.toUpperCase() : '';

    let effectiveCurrentWord = currentWordUpper;
    let extractedFromFallback = false;

    // Fallback 1: Monaco 가 빈 문자열을 반환했지만, 텍스트가 "." 으로 끝나는 경우 (A. 입력 후)
    if (!effectiveCurrentWord && textBeforeCursor.endsWith('.')) {
        const lastDotIndex = textBeforeCursor.lastIndexOf('.');
        if (lastDotIndex >= 0) {
            // 점 바로 앞의 alias 추출 시도
            const beforeDot = textBeforeCursor.substring(0, lastDotIndex).trim();
            const words = beforeDot.split(/\s+/);
            const potentialAlias = words[words.length - 1] || '';
            
            // "." 만 입력된 상태에서는 빈 문자열 반환 (표시 후 컬럼 추천)
            effectiveCurrentWord = '';  // 빈 문자열이지만 컨택스트가 "X." 형식임
            extractedFromFallback = true;
        } else {
            effectiveCurrentWord = '.'.toUpperCase(); 
            extractedFromFallback = true;
        }
    }
    
    // Fallback 2: Monaco 가 빈 문자열을 반환한 경우, 텍스트에서 직접 추출 (일반적인 입력)
    if (!effectiveCurrentWord && textBeforeCursor && !textBeforeCursor.endsWith('.')) {
        const lastTokenMatch = textBeforeCursor.match(/([A-Za-z0-9_]+)$/);
        if (lastTokenMatch) {
            effectiveCurrentWord = lastTokenMatch[1].toUpperCase();
            
            extractedFromFallback = true;
        }
    }

    return {
        currentWord: effectiveCurrentWord,
        extractedFromFallback,
    };
}
