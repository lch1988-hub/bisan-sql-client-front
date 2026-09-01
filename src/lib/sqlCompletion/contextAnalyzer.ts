/**
 * SQL 자동완성 Context 분석 모듈
 * 커서 위치 및 쿼리 문맥 분석 전용
 */

import { getQueryAtCursor, monacoPositionToOffset } from '../sqlQueryParser/index';
import type { QueryAtCursorResult } from '../sqlQueryParser/types';

export interface ParsedContext {
    queryAtCursor: QueryAtCursorResult;
    cursorOffsetInQuery: number;
}

/**
 * 커서 위치에서 쿼리 문맥 파싱
 */
export function parseQueryContext(
    modelValue: string,
    position: any
): ParsedContext | null {
    const cursorOffset = monacoPositionToOffset(modelValue, position);
    
    console.log('[parseQueryContext] DEBUG:', {
        fullModelValue: modelValue.length > 100 ? `${modelValue.substring(0, 80)}...` : modelValue,
        cursorPosition: position,  
        cursorOffset,
        modelLength: modelValue.length  
    });
    
    try {
        const queryAtCursor = getQueryAtCursor(modelValue, cursorOffset);
        
        console.log('[parseQueryContext] QueryAtCursor result:', {
            queryText: queryAtCursor?.queryText,
            queryIndex: queryAtCursor?.queryIndex,  
            statementStartOffset: queryAtCursor?.statementStartOffset
        });
        
        if (!queryAtCursor) {
            return null;
        }
        
        return {
            queryAtCursor,
            cursorOffsetInQuery: Math.max(0, cursorOffset - queryAtCursor.statementStartOffset)
        };
    } catch(err) {
        console.error('[ContextParser] Failed to parse query context:', err);
        
        // Fallback: 전체 쿼리를 단일 문맥으로 처리
        return {
            queryAtCursor: {
                queryText: modelValue,
                queryIndex: 1,
                statementStartOffset: 0,
                isComplete: false
            },
            cursorOffsetInQuery: cursorOffset
        };
    }
}
