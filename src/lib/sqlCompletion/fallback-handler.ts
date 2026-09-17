/**
 * SQL 자동완성 Fallback 핸들러
 * GROUP BY, ORDER BY 등 다른 절의 fallback 로직 전용
 */

import type { CompletionItem } from './types';

/**
 * 테이블명 일치하는 suggestions 생성
 */
export function createMatchingTableSuggestions(
    partialNameFromInput: string,
    tableColumns: Record<string, string[]>
): CompletionItem[] | null {
    const MONACO_KINDS = window.monaco?.languages;
    
    if (!MONACO_KINDS) return null;

    const allTableNames = Object.keys(tableColumns);
    const matchingTables = allTableNames.filter(tableName => 
        tableName.startsWith(partialNameFromInput.toUpperCase())
    );
    
    if (matchingTables.length === 0) return null;
    
    return matchingTables.map(tableName => ({
        label: tableName,
        kind: MONACO_KINDS.CompletionItemKind.Interface,
        insertText: tableName,
        detail: `Table (${tableColumns[tableName].length} Columns)`,
        documentation: `${tableName}`,
        sortText: '1'
    }));
}

/**
 * Fallback suggestions 생성 (전체 테이블 + 키워드)
 */
export function createFallbackSuggestions(
    sqlKeywords: string[],
    tableColumns?: Record<string, string[]>
): CompletionItem[] {
    const MONACO_KINDS = window.monaco?.languages;
    
    if (!MONACO_KINDS) return [];

    const fallbackSuggestions: CompletionItem[] = [];
    
    // 1. SQL 키워드 추가
    for (const sqlKeyword of sqlKeywords) {
        fallbackSuggestions.push({
            label: sqlKeyword.toUpperCase(),
            kind: MONACO_KINDS.CompletionItemKind.Keyword,
            insertText: sqlKeyword.toUpperCase(),
            documentation: `SQL ${sqlKeyword}`,
            sortText: '2'
        });
    }

    // 2. 전체 테이블 추가
    if (tableColumns) {
        for (const [tableName, columnsList] of Object.entries(tableColumns)) {
            fallbackSuggestions.push({
                label: tableName,
                kind: MONACO_KINDS.CompletionItemKind.Table,
                insertText: tableName,
                detail: `Table (${columnsList.length} Columns)`,
                documentation: `${tableName}`,
                sortText: '3'
            });
        }
    }

    return fallbackSuggestions;
}
