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
 * Monaco 커서 위치 (最小 구조)
 */
export interface MonacoPosition {
    lineNumber: number;
    column: number;
}

/**
 * Monaco 단어 정보 (最小 구조 - wordExtractor 에서 사용)
 */
export interface MonacoWord {
    word?: string;
    startColumn?: number;
    endColumn?: number;
}

/**
 * Monaco languages 네임스페이스 (CompletionItemKind 만 사용)
 */
export interface MonacoLanguages {
    CompletionItemKind: Record<string, number>;
}

/**
 * Monaco 자동완성 제언 항목 타입
 */
export interface CompletionItem {
    label: string;
    kind: number;  // CompletionItemKind 값 (number)
    insertText: string;
    detail?: string;
    documentation?: string;
    sortText: string;
}
