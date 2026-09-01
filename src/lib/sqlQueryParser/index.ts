/**
 * SQL 쿼리를 세미콜론으로 분리하고 현재 커서 위치를 감지
 */

import { QueryAtCursorResult, SQLStatement } from './types';

/**
 * 스트링과 주석을 처리하며 SQL 을 다중 쿼리로 분할  
 */
export function splitSQLStatements(sql: string): SQLStatement[] {
    const statements: SQLStatement[] = [];

    if (!sql || sql.trim().length === 0) return statements;

    let i = 0;
    let startIdx = 0;
    const len = sql.length;

    while (i < len) {
        const char = sql[i];

        // Single-line 주석 (-- 까지 \n 전까지)  
        if (char === '-' && i + 1 < len && sql[i + 1] === '-') {
            while (i < len && sql[i] !== '\n' && sql[i] !== '\r') i++;
            continue;
        }

        // Multi-line 주석 (/* ... */)  
        if (char === '/' && i + 1 < len && sql[i + 1] === '*') {
            let foundEnd = false;
            for (let j = i + 2; j < len - 1; j++) {
                if (sql[j] === '*' && sql[j + 1] === '/') {
                    i = j + 2;
                    foundEnd = true;
                    break;
                }
            }
            if (!foundEnd) i = len;
            continue;
        }

        // Single-quote 스트링 처리  
        if (char === "'") {
            while (i < len && sql[i] !== "'") {
                if (sql[i] === '\\' && i + 1 < len) i += 2;  
                else i++;
            }
            i++; 
            continue;
        }

        // Double-quote 스트링 처리  
        if (char === '"') {
            while (i < len && sql[i] !== '"') {
                if (sql[i] === '\\' && i + 1 < len) i += 2;  
                else i++;
            }
            if (i < len) i++; 
            continue;
        }

        // Backtick identifier 처리  
        if (char === '`') {
            while (i < len && sql[i] !== '`') i++;
            if (i < len) i++; 
            continue;
        }

        // 세미콜론 - 쿼리 분리점  
        if (char === ';') {
            const stmtText = sql.substring(startIdx, i).trim();

            if (stmtText.length > 0) {
                statements.push({
                    statement: stmtText,
                    startIndex: startIdx,
                    endIndex: i + 1 
                });
            }

            startIdx = i + 1;  
        }

        i++;
    }

    // 마지막 쿼리 (세미콜론 없는 incomplete)
    const finalSegment = sql.substring(startIdx).trim();
    if (finalSegment.length > 0) {
        statements.push({
            statement: finalSegment,
            startIndex: startIdx,  
            endIndex: len
        });
    }

    return statements;
}

/**
 * 현재 커서 위치를 포함하는 SQL 쿼리 추출  
 */
export function getQueryAtCursor(
    sql: string, 
    cursorOffset: number
): QueryAtCursorResult | null {
    if (!sql || cursorOffset === undefined || cursorOffset < 0) {
        const trimmed = sql.trim();
        return {
            queryText: trimmed,
            queryIndex: 1,
            statementStartOffset: sql.indexOf(trimmed),  
            isComplete: false
        };
    }

    const statements = splitSQLStatements(sql);

    for (let idx = 0; idx < statements.length; idx++) {
        const stmt = statements[idx];

        // 커서가 이 쿼리 범위 안인지 확인
        if (cursorOffset >= stmt.startIndex && cursorOffset <= stmt.endIndex) {
            return {
                queryText: stmt.statement,
                queryIndex: idx + 1,  
                statementStartOffset: stmt.startIndex,
                isComplete: sql[stmt.endIndex - 1] === ';' || false
            };
        }
    }

    if (statements.length > 0) {
        const first = statements[0];
        return {
            queryText: first.statement,
            queryIndex: 1,
            statementStartOffset: first.startIndex,
            isComplete: sql[first.endIndex - 1] === ';' || false
        };  
    }

    return null;
}

/**
 * Monaco position 을 텍스트 오프셋으로 변환  
 */
export function monacoPositionToOffset(
    modelValue: string, 
    position: { lineNumber: number; column: number }
): number {
    const lines = modelValue.split('\n');
    
    let offset = 0;
    
    for (let i = 0; i < position.lineNumber - 1; i++) {
        offset += lines[i].length + 1; 
    }
    
    return offset + (position.column - 1);
}
