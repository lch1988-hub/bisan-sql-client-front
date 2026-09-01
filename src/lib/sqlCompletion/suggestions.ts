/**
 * SQL 자동완성 공통 제언 생성 유틸리티
 * 절별 특수 로직은 where-suggestions.ts, from-suggestions.ts, select-suggestions.ts 에서 처리
 */

import type { TableColumns, CompletionItem } from './types';

/**
 * 중복 제언을 제거하는 유틸리티 함수
 */
export function deduplicateByLabel(items: CompletionItem[]): CompletionItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
        if (seen.has(item.label)) return false;
        seen.add(item.label);
        return true;
    });
}

/**
 * SQL 키워드 제언 생성 - 공통 utility 로 축소
 */
export function createKeywordSuggestions(
    sqlKeywords: string[],
    monacoLanguages: any
): CompletionItem[] {
    return sqlKeywords.map(keyword => ({
        label: keyword.toUpperCase(),
        kind: monacoLanguages.CompletionItemKind.Keyword,
        insertText: keyword.toUpperCase(),
        documentation: `SQL ${keyword}`,
        sortText: '2'
    }));
}

