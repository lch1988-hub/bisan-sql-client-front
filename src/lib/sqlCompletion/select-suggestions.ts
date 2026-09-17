/**
 * SELECT 절 (FROM 전) 전용 자동완성 제언 생성 로직
 * - 테이블명 제안 우선
 * - 아직 FROM 이 없는 상태이므로 첫 테이블 입력 중으로 간주
 */

import type { TableColumns, CompletionItem, MonacoLanguages } from './types';

/**
 * SELECT-only 에서 테이블명 자동완성 제언 생성
 */
export function createSelectTableSuggestions(
    partialName: string,
    tableColumns: TableColumns | undefined,
    monacoLanguages: MonacoLanguages
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
 * SELECT-only 전용 fallback 제안 - 전체 테이블 목록 + 키워드
 */
export function createSelectFallbackSuggestions(
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[],
    monacoLanguages: MonacoLanguages
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

        // 첫 5 개 컬넘 힌트로 제안
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

    // SQL 키워드 추가 (SELECT, FROM, WHERE 등)
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
 * SELECT-only 자동완성 엔트리 포인트
 */
export function handleSelectOnlyCompletion(
    partialNameFromInput: string | null,
    targetTableName: string | null,
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[],
    effectiveCurrentWord?: string,  // "X." 처리를 위한 추가 파라미터
    isDotFormatWithoutTrailingDot: boolean = false  //  "A<char>" 패턴 (예: A.P 에서 P 입력 중)
): CompletionItem[] {
    const monacoLanguages = window.monaco?.languages;
    if (!monacoLanguages) return [];

    // NEW: "X." 형식 처리 - alias 가 끝나는 점 바로 다음 (컬럼 제안 필요)
    if (effectiveCurrentWord && effectiveCurrentWord.endsWith('.')) {
        // targetTableName 이 이미 INNER scope 에서 추출된 것인지 확인 (index.ts 로직이 처리했음)
        if (!targetTableName) {
            console.warn('[SelectOnlyCompletion] ️ No table resolved for alias in INNER scope, returning empty');
            return [];  // OUTER fallback 금지!
        }
        
        const columns = tableColumns?.[targetTableName];
        if (columns && columns.length > 0) {
            return columns.map(col => ({
                label: col,
                 kind: monacoLanguages.CompletionItemKind.Field,
                insertText: col,
                detail: `Column from ${targetTableName}`,
                documentation: `${targetTableName}.${col}`,
                sortText: '1'
            }));
        } else {
            console.warn('[SelectOnlyCompletion] ️ No columns found for', targetTableName);
            return [];  // OUTER 를 fallback 으로 사용하지 않음
        }
    }

    //  NEW: Single char 입력 중 (A.P 패턴) - 컬럼에서 부분일치
    if (isDotFormatWithoutTrailingDot && targetTableName && effectiveCurrentWord?.length === 1) {
        const columns = tableColumns?.[targetTableName];
        if (columns && columns.length > 0) {
            const filteredCols = columns.filter(col => 
                col.startsWith(effectiveCurrentWord!.toUpperCase())
            );
            
            if (filteredCols.length > 0) {
                return filteredCols.map(col => ({
                    label: col,
                    kind: monacoLanguages.CompletionItemKind.Field,
                    insertText: col,
                    detail: `Column from ${targetTableName}`,
                    documentation: `${targetTableName}.${col}`,
                    sortText: '1'
                }));
            }
        }
    }

    // 테이블명 제안 우선
    const inputToUse = partialNameFromInput || targetTableName || '';

    if (inputToUse) {
        const tableSuggestions = createSelectTableSuggestions(
            inputToUse,
            tableColumns,
            monacoLanguages
        );

        if (tableSuggestions.length > 0) {
            return tableSuggestions;
        }
    }

    // Fallback: 전체 테이블 목록 + 키워드
    return createSelectFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
}
