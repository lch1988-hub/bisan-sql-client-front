/**
 * SQL 자동완성 관련 타입 정의
 */

export interface TableColumns {
    [tableName: string]: string[];
}

export interface CompletionContext {
    currentQuery: string;
    textBeforeCursor: string;
    upperText: string;
    cursorOffsetInQuery: number;
}

export interface ParsingResult {
    currentClause: string | null;
    lastSelectIdx: number;
    lastFromIdx: number;
    lastWhereIdx: number;
    lastGroupByIdx: number;
    lastOrderByIdx: number;
}

export interface TableExtractResult {
    targetTableName: string | null;
    partialNameFromInput: string | null;
    isInsideSelectOnly: boolean;
}

/**
 * Monaco 자동완성 제언 항목 타입
 */
export interface CompletionItem {
    label: string;
    kind: any;
    insertText: string;
    detail?: string;
    documentation?: string;
    sortText: string;
}
