/**
 * SQL 파싱 관련 타입 정의  
 */

export interface SQLStatement {
    statement: string;     // 쿼리 텍스트 (trim됨)
    startIndex: number;    // 원본 SQL 에서 시작 오프셋  
    endIndex: number;      // 원본 SQL 에서 끝 오프셋 (세미콜론 포함)
}

export interface QueryAtCursorResult {
    queryText: string;
    queryIndex: number;             // 1-based 인덱스
    statementStartOffset: number;   // 원본 SQL 의 시작 위치
    isComplete: boolean;             // 세미콜론으로 끝났는지
}

export interface ClausePositions {
    select?: number;
    from?: number;
    where?: number;
    groupByIdx?: number;
    having?: number;
    orderBy?: number;
    limit?: number;
}
