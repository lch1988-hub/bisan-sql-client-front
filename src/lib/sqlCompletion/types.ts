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

export interface CteDefinition {
    name: string;
    position: number;  // WITH 절 내 위치
    querySegment?: string;  // AS (...) 부분 (선택적)
}

export interface ParsingResult {
    currentClause: string | null;
    lastSelectIdx: number;
    lastFromIdx: number;
    lastWhereIdx: number;
    lastGroupByIdx: number;
    lastOrderByIdx: number;
    lastHavingIdx?: number;  // NEW: for HAVING clause tracking
    lastConnectByIdx?: number;  // Oracle CONNECT BY 위치
    lastStartWithIdx?: number;  // Oracle START WITH 위치
    cteDefinitions?: CteDefinition[];  // NEW: CTE 목록 (WITH 절에서 추출)
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
