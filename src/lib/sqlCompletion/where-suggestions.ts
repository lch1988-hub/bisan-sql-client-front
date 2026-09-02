/**
 * WHERE 절 전용 자동완성 제언 생성 로직
 * - alias.column 형식일 때: 해당 테이블의 컬럼 제안
 * - 점없는 입력일 때: 테이블명/alias 제안  
 */

import type { TableColumns, CompletionItem } from './types';

/**
 * WHERE 절에서 컬럼 자동완성 제언 생성 (alias.column 형식)
 */
export function createWhereColumnSuggestions(
    tableName: string,
    columns: string[],
    currentWordUpper: string,  // e.g., "A." or "A.CHANGE_"  
    aliasName: string,         // e.g., "A"
    monacoLanguages: any
): CompletionItem[] {
    // Extract the column part after the dot (e.g., "CHANGE_DATE" from "A.CHANGE_")
    const partialColumn = currentWordUpper.includes('.') 
        ? currentWordUpper.split('.')[1] || ''  // Get part after first dot
        : '';
    
    console.log('[createWhereColumnSuggestions] Filtering columns:', {
        input: currentWordUpper,
        alias: aliasName,
        partialColumn: partialColumn || '(empty - show all)',
        totalColumnsAvailable: columns.length
    });
    
    // If no typing after the dot (just "A."), show ALL columns
    if (!partialColumn || partialColumn.length === 0) {
        console.log('[createWhereColumnSuggestions] ℹ️ Empty column input  showing 2 50 columns');
        return columns.slice(0, 50).map(col => ({
            label: col,
            kind: monacoLanguages.CompletionItemKind.Field,
            insertText: col,
            detail: `Column from ${tableName} (alias: ${aliasName})`,
            documentation: `${tableName}.${col}`,
            sortText: '1'
        }));
    }

    // Filter columns that match the partial column name
    const filteredColumns = columns.filter(col => 
        col.toUpperCase().includes(partialColumn.toUpperCase())
    );

    if (filteredColumns.length === 0) {
        console.log('[createWhereColumnSuggestions] ️ No matching columns for', partialColumn);
        return [];
    }

    console.log('[createWhereColumnSuggestions]  Found', filteredColumns.length, 'matching columns');
    
    return filteredColumns.slice(0, 50).map(col => ({
        label: col,
        kind: monacoLanguages.CompletionItemKind.Field,
        insertText: col,
        detail: `Column from ${tableName} (alias: ${aliasName})`,
        documentation: `${tableName}.${col}`,
        sortText: '1'
    }));
}

/**
 * WHERE 절에서 테이블명/alias 자동완성 제언 생성
 */
export function createWhereTableSuggestions(
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
 * WHERE 절 전용 fallback 제안 - 전체 테이블 목록 + 컬럼 혼합
 */
export function createWhereFallbackSuggestions(
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[],
    monacoLanguages: any
): CompletionItem[] {
    if (!tableColumns) return [];

    const completions: CompletionItem[] = [];

    // 테이블명 제안
    for (const [tableName, columnsList] of Object.entries(tableColumns)) {
        completions.push({
            label: tableName,
            kind: monacoLanguages.CompletionItemKind.Table,
            insertText: tableName,
            detail: `Table (${columnsList.length} columns)`,
            documentation: `${tableName}`,
            sortText: '3'
        });

        // 첫 5 개 컬럼만 제안
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

    // SQL 키워드 추가
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
 * WHERE 절 자동완성 엔트리 포인트
 */
export function handleWhereCompletion(
    currentWordUpper: string,
    effectiveCurrentWord: string,
    targetTableName: string | null,  // For backward compatibility
    targetTableNames: string[],  // NEW: 모든 FROM 테이블 배열
    partialNameFromInput: string | null,
    aliasToTableName: Record<string, string>,
    tableColumns: TableColumns | undefined,
    sqlKeywords: string[]
): CompletionItem[] {
    const monacoLanguages = (window as any).monaco?.languages;
    if (!monacoLanguages) return [];

    console.log('[WhereCompletion]  Processing WHERE clause completion:', {
        currentWordUpper,
        effectiveCurrentWord,
        targetTableName,
        partialNameFromInput,
        hasDot: effectiveCurrentWord.includes('.')
    });

    // Case 1: alias.column 형식 - 컬럼 제안
    if (effectiveCurrentWord.includes('.')) {
        console.log('[WhereCompletion]  Detected alias.column format  suggesting columns');

        const targetType = targetTableName;
        
        if (!targetType) {
            console.log('[WhereCompletion] ️ No target table resolved, falling back');
            return createWhereFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
        }

        //  [DEBUG] Check if table exists in metadata
        const allTableKeys = Object.keys(tableColumns || {});
        const tableExistsInMetadata = allTableKeys.includes(targetType.toUpperCase());
        
        console.log('[WhereCompletion]  Table resolution check:', {
            resolvedTable: targetType,
            aliasUsed: partialNameFromInput,
            existsInMetadata: tableExistsInMetadata,
            availableTables: allTableKeys.slice(0, 10).join(', '),
            totalTables: allTableKeys.length
        });

        //  [CRITICAL] First try exact key match, then case-insensitive
        let columns = tableColumns?.[targetType];
        let usedTableKey = targetType;
        
        if (!columns || columns.length === 0) {
            const foundTableKey = allTableKeys.find(key => key.toUpperCase() === targetType.toUpperCase());
            
            if (foundTableKey && tableColumns?.[foundTableKey]) {
                console.log('[WhereCompletion]  Found matching table with different casing:', {
                    resolved: targetType,
                    actualKey: foundTableKey,
                    columnCount: tableColumns[foundTableKey]?.length || 0,
                    firstFiveCols: tableColumns[foundTableKey]?.slice(0, 5) || []
                });
                
                columns = tableColumns[foundTableKey];
                usedTableKey = foundTableKey;
            } else {
                console.warn('[WhereCompletion] ️ Table not found even with case-insensitive lookup');
            }
        }
        
        //  Show detailed debug info about the resolved table
        console.log('[WhereCompletion]  Resolved table details:', {
            keyUsed: usedTableKey,
            aliasUsed: partialNameFromInput,
            columnCount: columns?.length || 0,
            hasColumns: !!(columns && columns.length > 0),
            firstFiveColumns: (columns || []).slice(0, 5)
        });
        
        //  Fallback: Resolved table not in metadata - search ALL tables for matching columns
        if (!columns || columns.length === 0) {
            console.warn('[WhereCompletion] ️ No columns found for resolved table:', targetType);
            
            // Try case-insensitive lookup
            const foundTableKey = allTableKeys.find(key => key.toUpperCase() === targetType.toUpperCase());
            
            if (foundTableKey && tableColumns?.[foundTableKey]) {
                console.log('[WhereCompletion]  Found matching table with different casing:', foundTableKey);
                
                // Check if columns exist before accessing them
                const cols = tableColumns[foundTableKey];
                if (cols) {
                    const columnSuggestions = createWhereColumnSuggestions(
                        foundTableKey,
                        cols,
                        currentWordUpper,
                        partialNameFromInput || '',
                        monacoLanguages
                    );
                    
                    if (columnSuggestions.length > 0) {
                        return columnSuggestions;
                    }
                }
            }
            
            //  [NEW] Fallback: Show ALL columns from ALL available tables with table prefix
            console.log('[WhereCompletion]  Falling back to ALL available columns across all tables');
            
            const globalColumnSuggestions: CompletionItem[] = [];
            
            for (const [tableName, cols] of Object.entries(tableColumns || {})) {
                // Extract partial column name after the dot (e.g., "A.CHANGE_D"  "CHANGE_D")
                const partialAfterDot = effectiveCurrentWord.includes('.') 
                    ? effectiveCurrentWord.split('.')[1] || '' 
                    : '';
                
                const matchingCols = cols.filter(col => 
                    col.toUpperCase().includes(partialAfterDot.toUpperCase())
                );
                
                // Show first 5 matching columns per table
                for (const col of matchingCols.slice(0, 5)) {
                    globalColumnSuggestions.push({
                        label: `${tableName}.${col}`,
                        kind: monacoLanguages.CompletionItemKind.Field,
                        insertText: col,  // Insert just the column name
                        detail: `From table: ${tableName} (aliased as ${partialNameFromInput || '?'})`,
                        documentation: `${tableName}.${col}`,
                        sortText: '1'
                    });
                }
                
                if (globalColumnSuggestions.length >= 50) break; // Limit total suggestions
            }
            
            if (globalColumnSuggestions.length > 0) {
                console.log('[WhereCompletion]  Returning', globalColumnSuggestions.length, 
                           'columns from ALL available tables as fallback');
                return globalColumnSuggestions;
            }
            
            // Still nothing - fall back to keywords only
            console.log('[WhereCompletion] ️ No columns found anywhere, using SQL keywords');
            return createWhereFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
        }

        const columnSuggestions = createWhereColumnSuggestions(
            usedTableKey,
            columns || [],
            currentWordUpper,  // Will be "A." or "A.CHANGE_" 
            partialNameFromInput || '',  // The alias "A"
            monacoLanguages
        );

        console.log('[WhereCompletion]  No columns matched the partial input, showing up to 50 columns');

        const allColumns = (columns || []).slice(0, 50).map(col => ({
            label: col,
            kind: monacoLanguages.CompletionItemKind.Field,
            insertText: col,
            detail: `Column from ${usedTableKey} (via alias ${partialNameFromInput || '?'})`,
            documentation: `${usedTableKey}.${col}`,
            sortText: '1'
        }));

        if (allColumns.length > 0) {
            console.log('[WhereCompletion]  Returning', allColumns.length, '- ALL columns from table');
            return allColumns;
        }

        // Final fallback to other tables or keywords
        console.log('[WhereCompletion] ️ No columns at all - falling back to keywords');
        return createWhereFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
    }

    // Case 2: 점이 없는 입력 - 테이블명/alias 제안 또는 컬럼 필터링
    console.log('[WhereCompletion]  No dot detected', { 
        targetTableName, 
        targetTableNames,  // NEW: 모든 FROM 테이블 배열
        partialNameFromInput,
        hasAvailableColumns: !!tableColumns?.[targetTableName || '']
    });

    // [NEW] targetTableNames 이 있으면 해당 테이블들의 컬럼을 모아서 제안
    if (targetTableNames && targetTableNames.length > 0) {
        const allMatchingCols: CompletionItem[] = [];
        
        for (const tableName of targetTableNames) {
            if (tableColumns?.[tableName]) {
                const columns = tableColumns[tableName];
                
                if (partialNameFromInput) {
                    // 사용자가 입력한 부분 ('S') 에 맞는 컬럼만 필터링
                    const matchingCols = columns.filter(col => 
                        col.toUpperCase().includes(partialNameFromInput.toUpperCase())
                    );
                    
                    console.log('[WhereCompletion]  Filtering columns from', tableName, 
                               'with partial:', partialNameFromInput, '→ Found', matchingCols.length);
                    
                    for (const col of matchingCols.slice(0, 50)) {
                        allMatchingCols.push({
                            label: col,
                            kind: monacoLanguages.CompletionItemKind.Field,
                            insertText: col,
                            detail: `Column from ${tableName}`,
                            documentation: `${tableName}.${col}`,
                            sortText: '1'
                        });
                    }
                } else {
                    // partialName 이 없으면 모든 컬럼 제안 (모든 FROM 테이블)
                    console.log('[WhereCompletion]  No partial input, showing ALL columns from', tableName);
                    
                    for (const col of columns.slice(0, 50)) {
                        allMatchingCols.push({
                            label: col,
                            kind: monacoLanguages.CompletionItemKind.Field,
                            insertText: col,
                            detail: `Column from ${tableName}`,
                            documentation: `${tableName}.${col}`,
                            sortText: '1'
                        });
                    }
                }
            }
        }
        
        // 최대 50 개까지 반환 (중복 제거 후)
        const deduplicated = allMatchingCols.filter((item, index, self) => 
            index === self.findIndex(other => other.label === item.label)
        );
        
        if (deduplicated.length > 0) {
            console.log('[WhereCompletion]  Returning', deduplicated.length, 'columns from ALL target tables');
            return deduplicated.slice(0, 50);
        }
    }

    // 기존 로직: 테이블명 제안 시도
    if (partialNameFromInput) {
        const tableSuggestions = createWhereTableSuggestions(
            partialNameFromInput,
            tableColumns,
            monacoLanguages
        );

        if (tableSuggestions.length > 0) {
            console.log('[WhereCompletion]  Returning', tableSuggestions.length, 'table suggestions');
            return tableSuggestions;
        }
    }

    // Fallback: 전체 테이블 목록 + 키워드
    console.log('[WhereCompletion] ️ No matches, using fallback');
    return createWhereFallbackSuggestions(tableColumns, sqlKeywords, monacoLanguages);
}
