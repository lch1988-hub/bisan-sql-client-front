/**
 * ORDER BY 절 전용 자동완성 제언 생성 로직
 * Oracle SQL 규칙:
 * - SELECT 절에 정의된 컬럼명 제안
 * - FROM/WHERE 절에서 접근 가능한 테이블 컬럼도 지원
 * - alias.column 형식 지원 (스코프 내 alias 만 사용)
 * - ASC/DESC 키워드 포함
 */

import type { TableColumns, CompletionItem } from './types';

/**
 * ORDER BY 에서 컬럼 자동완성 제언 생성
 * SELECT 절에 이미 있는 컬럼들과 FROM/WHERE 에서 접근 가능한 컬럼들 제안
 */
export function createOrderByColumnSuggestions(
    tableName: string | null,
    columns: string[],
    currentWordUpper: string,
    monacoLanguages: any,
    isPrefixedByAlias: boolean = false  // alias.column 형식인지 여부
): CompletionItem[] {
    if (!currentWordUpper || currentWordUpper.length <= 1) {
        const suggestions = columns.slice(0, 50).map(col => ({
            label: col,
            kind: monacoLanguages.CompletionItemKind.Field,
            insertText: col,
            detail: `Column from ${tableName || 'SELECT'}`,
            documentation: `${tableName ? tableName + '.' : ''}${col}`,
            sortText: '1'
        }));

        // "ORDER BY" 에 자주 쓰이는 ASC/DESC 키워드 추가
        suggestions.push({
            label: 'ASC',
            kind: monacoLanguages.CompletionItemKind.Keyword,
            insertText: 'ASC',
            detail: 'Ascending order',
            documentation: 'Sort in ascending order',
            sortText: 'a'
        }, {
            label: 'DESC',
            kind: monacoLanguages.CompletionItemKind.Keyword,
            insertText: 'DESC',
            detail: 'Descending order',
            documentation: 'Sort in descending order',
            sortText: 'd'
        });

        return suggestions;
    }

    const filteredColumns = columns.filter(col => 
        col.toUpperCase().includes(currentWordUpper)
    );

    if (filteredColumns.length === 0) {
        return [];
    }

    return filteredColumns.slice(0, 50).map(col => ({
        label: col,
        kind: monacoLanguages.CompletionItemKind.Field,
        insertText: col,
        detail: `Column from ${tableName || 'SELECT'}`,
        documentation: `${tableName ? tableName + '.' : ''}${col}`,
        sortText: '1'
    }));
}

/**
 * ORDER BY 에서 테이블명/alias 자동완성 제언 생성
 */
export function createOrderByTableSuggestions(
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
 * ORDER BY 절 fallback 제안 - 전체 테이블 + 컬럼 + 키워드
 */
export function createOrderByFallbackSuggestions(
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

        // 첫 5 개 컬럼 힌트로 제안
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

    // ORDER BY 관련 SQL 키워드 추가 (ASC/DESC 우선)
    const orderKeywords = ['ASC', 'DESC'];
    for (const keyword of orderKeywords) {
        completions.push({
            label: keyword,
            kind: monacoLanguages.CompletionItemKind.Keyword,
            insertText: keyword,
            documentation: `Sort ${keyword.toLowerCase()}ending`,
            sortText: 'a'
        });
    }

    // 일반 SQL 키워드 추가
    const commonKeywords = sqlKeywords.filter(kw => !['asc', 'desc'].includes(kw.toLowerCase()));
    for (const keyword of commonKeywords) {
        completions.push({
            label: keyword.toUpperCase(),
            kind: monacoLanguages.CompletionItemKind.Keyword,
            insertText: keyword.toUpperCase(),
            documentation: `SQL ${keyword}`,
            sortText: '2'
        });
    }

    return completions;
}

/**
 * ORDER BY 절 자동완성 엔트리 포인트
 */
export function handleOrderByCompletion(
    partialNameFromInput: string | null,
    targetTableName: string | null,
    tableColumns: TableColumns | undefined,
    aliasToTableName?: Record<string, string>,
    effectiveCurrentWord?: string  // "X." 처리를 위한 추가 파라미터
): CompletionItem[] {
    const monacoLanguages = (window as any).monaco?.languages;
    if (!monacoLanguages) return [];

    // Case 1: "alias." 형식 처리 - SELECT 절에 이미 있는 컬럼들 제안
    if (effectiveCurrentWord && effectiveCurrentWord.endsWith('.')) {
        const aliasName = effectiveCurrentWord.substring(0, effectiveCurrentWord.length - 1).toUpperCase();

        // targetTableName 이 이미 추출되었으면 해당 테이블의 컬럼 제안
        if (targetTableName) {
            const columns = tableColumns?.[targetTableName];
            if (columns && columns.length > 0) {
                return createOrderByColumnSuggestions(
                    targetTableName,
                    columns,
                    '',
                    monacoLanguages,
                    true  // isPrefixedByAlias
                );
            } else {
                console.warn('[OrderByCompletion] No columns found for', targetTableName);
                return createOrderByFallbackSuggestions(tableColumns, [], monacoLanguages);
            }
        }

        // alias 가 유효하지 않으면 fallback
        const resolvedTable = aliasToTableName?.[aliasName];
        if (resolvedTable) {
            const columns = tableColumns?.[resolvedTable];
            if (columns && columns.length > 0) {
                return createOrderByColumnSuggestions(
                    resolvedTable,
                    columns,
                    '',
                    monacoLanguages,
                    true
                );
            }
        } else {
            console.warn('[OrderByCompletion] Cannot resolve alias:', aliasName);
        }

        // fallback 으로 전체 테이블 + 컬럼 제안
        return createOrderByFallbackSuggestions(tableColumns, ['asc', 'desc'], monacoLanguages);
    }

    // Case 2: 점없는 입력 - 컬먼이 우선, 아니면 테이블명 제안
    const inputToUse = partialNameFromInput || targetTableName || '';

    if (inputToUse) {
        // 테이블명이면 해당 테이블의 컬럼 제안
        if (tableColumns?.[inputToUse]) {
            const columns = tableColumns[inputToUse];

            // 3 자 미만이면 전체 컬럼, 그 이상이면 필터링된 컬럼
            let suggestedColumns: string[] = [];
            if (inputToUse.length < 2 || inputToUse.includes('.')) {
                suggestedColumns = columns;
            } else {
                const searchUpper = inputToUse.toUpperCase();
                suggestedColumns = columns.filter(col => col.toUpperCase().includes(searchUpper));
            }

            if (suggestedColumns && suggestedColumns.length > 0) {
                return createOrderByColumnSuggestions(
                    inputToUse,
                    suggestedColumns.slice(0, 50),
                    '',
                    monacoLanguages,
                    false
                );
            }
        } else {
            // 컬먼이 없으면 테이블명 제안 시도
            const tableSuggestions = createOrderByTableSuggestions(inputToUse, tableColumns, monacoLanguages);

            if (tableSuggestions.length > 0) {
                return tableSuggestions;
            }
        }
    }

    // Fallback: 전체 테이블 + 컬럼 목록 + ASC/DESC 키워드
    return createOrderByFallbackSuggestions(
        tableColumns, 
        ['asc', 'desc', 'nulls', 'first', 'last'], 
        monacoLanguages
    );
}
