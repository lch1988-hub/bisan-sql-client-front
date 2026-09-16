/**
 * FROM 절 전용 자동완성 제언 생성 로직
 * - 항상 테이블명만 제안 (컬럼 절대 금지)
 * - nested query 처리 고려
 */

import type { TableColumns, CompletionItem } from './types';

/**
 * FROM 절에서 테이블명 자동완성 제언 생성
 */
export function createFromTableSuggestions(
    partialName: string,
    tableColumns: TableColumns | undefined,
    monacoLanguages: any
): CompletionItem[] {
    if (!partialName) return [];

    const allTableNames = Object.keys(tableColumns || {});
    const matchingTables = allTableNames.filter(tableName => 
        tableName.startsWith(partialName.toUpperCase())
    );

    if (matchingTables.length === 0) return [];

    return matchingTables.slice(0, 50).map(tableName => ({
        label: tableName,
        kind: monacoLanguages.CompletionItemKind.Interface,
        insertText: tableName,
        detail: `Table (${tableColumns?.[tableName]?.length || 0} columns)`,
        documentation: `${tableName}`,
        sortText: '1'
    }));
}

/**
 * FROM 절 전용 fallback 제안 - 전체 테이블 목록 + 키워드
 */
export function createFromFallbackSuggestions(
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[],
    monacoLanguages: any
): CompletionItem[] {
    if (!tableColumns) return [];

    const completions: CompletionItem[] = [];

    // 테이블명 제안 (모든 테이블)
    for (const [tableName, columnsList] of Object.entries(tableColumns)) {
        completions.push({
            label: tableName,
            kind: monacoLanguages.CompletionItemKind.Table,
            insertText: tableName,
            detail: `Table (${columnsList.length} columns)`,
            documentation: `${tableName}`,
            sortText: '3'
        });

        // 첫 5 개 컬럼만 힌트로 제안 (테이블 선택 후 도움을 주기 위함)
        for (const col of columnsList.slice(0, 5)) {
            completions.push({
                label: `${tableName}.${col}`,
                kind: monacoLanguages.CompletionItemKind.Field,
                insertText: col,
                detail: `Column from ${tableName}`,
                sortText: '3'
            });
        }
    }

    // SQL 키워드 추가 (AS, JOIN 등)
    const keywordCompletions = sqlKeywords.map(keyword => ({
        label: keyword.toUpperCase(),
        kind: monacoLanguages.CompletionItemKind.Keyword,
        insertText: keyword.toUpperCase(),
        documentation: `SQL ${keyword}`,
        sortText: '2'
    }));

    return [...keywordCompletions, ...completions];
}

/**
 * FROM 절 자동완성 엔트리 포인트
 */
export function handleFromCompletion(
    partialNameFromInput: string | null,
    targetTableName: string | null,
    hasValidTableInFROM: boolean,
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[]
): CompletionItem[] {
    const monacoLanguages = (window as any).monaco?.languages;
    if (!monacoLanguages) return [];

    // 테이블명 제안 우선
    const inputToUse = partialNameFromInput || targetTableName || '';

    if (inputToUse) {
        const tableSuggestions = createFromTableSuggestions(
            inputToUse,
            tableColumns,
            monacoLanguages
        );

        if (tableSuggestions.length > 0) {
            return tableSuggestions;
        }
    }

    // Fallback: 전체 테이블 목록 + 키워드
    return createFromFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
}
