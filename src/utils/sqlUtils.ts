/**
 * SQL 문자열에서 현재 커서가 포함된 문장 (하나) 만 추출
 * 여러 세미콜론 (`;`) 구분된 쿼리 중 커서 위치의 단일 문장만 선택해서 백엔드로 보낼 때 사용
 */
export function extractCurrentQuery(sql: string, cursorPosition: number): string {
    if (!sql || sql.trim() === '') {
        return '';
    }

    // cursorPosition 이 0 일 수도 있음 (문자 시작 위치) -> 유효한 값!
    if (cursorPosition < 0 || cursorPosition > sql.length) {
        return sql;
    }

    // 세미콜론이 나타나는 모든 위치 찾기
    const semicolonPositions: number[] = [];
    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === ';') {
            semicolonPositions.push(i);
        }
    }
    
    // 세미콜론이 없으면 전체 반환
    if (semicolonPositions.length === 0) {
        console.log('[extractCurrentQuery] ; 없음, 전체 반환');
        return sql.trim();
    }
    
    let startIdx = 0;
    let endIdx = sql.length;

    for (const semiPos of semicolonPositions) {
        if (cursorPosition <= semiPos) {
            // 커서가 이 세미콜론 이전에 있으면, 현재 문장이 대상
            startIdx = getStatementStart(sql, semiPos);
            endIdx = semiPos;
            return sql.substring(startIdx, endIdx).trim();
        }
    }
    
    // 모든 ; 를 넘었으므로 마지막 문장 반환 (마지막 ; 이후부터 끝까지)
    const lastSemiPos = semicolonPositions[semicolonPositions.length - 1];
    
    // 주의: 이 경우 "마지막 ; 뒤의 내용"을 가져와야 함
    startIdx = lastSemiPos + 1;
    endIdx = sql.length;
    const result = sql.substring(startIdx, endIdx).trim();
    
    return result;
}

/**
 * 현재 위치에서 앞쪽으로 첫 번째 세미콜론 뒤의 시작 지점 찾기
 */
function getStatementStart(sql: string, currentSemiPos: number): number {
    // 직전 세미콜론 위치 찾기 (이 ; 에서 거슬러 올라가며 검색)
    for (let i = currentSemiPos - 1; i >= 0; i--) {
        if (sql[i] === ';') {
            return i + 1; // ; 바로 다음부터 시작
        }
    }
    // 첫 번째 문장이면 처음부터
    return 0;
}

/**
 * 여러 SQL 문장에서 현재 커서가 위치해있는 문장의 인덱스를 반환 (0-based)
 */
export function getCurrentStatementIndex(sql: string, cursorPosition: number): number {
    if (!sql || !cursorPosition) return 0;

    let index = -1;
    
    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === ';') {
            index++;
            if (cursorPosition <= i) {
                break;
            }
        }
    }
    
    return Math.max(0, index);
}
