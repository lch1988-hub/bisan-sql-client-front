/**
 * SQL Subquery Scope Resolver - Extract LOCAL alias mappings from innermost SELECT only
 * 
 * Oracle/SQL Scoping Rules:
 * - Inner query CANNOT reference outer WHERE clause table aliases
 * - Inner query CAN see its own FROM clause aliases  
 * - Outer query CAN reference inner subquery results (but columns must match types)
 */

import { extractFromClause } from '../sqlContextAnalyzer/contextExtractor';

export interface ScopeInfo {
    currentDepth: number;
    selectPositions: Array<{ pos: number; depth: number }>;
    currentSelectSegment: string | null;
}

export interface ScopedAliasMapping {
    localAliases: Record<string, string>;
    parentMappings?: Record<string, string>;
    isNested: boolean;
}

export function findSelectsWithDepths(text: string): Array<{ pos: number; depth: number }> {
    const selects: Array<{ pos: number; depth: number }> = [];
    const upperText = text.toUpperCase();
    
    let currentDepth = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') {
            currentDepth++;
        } else if (text[i] === ')') {
            currentDepth = Math.max(0, currentDepth - 1);
        }
        
        const remainingText = upperText.substring(i);
        if (/^SELECT\b/.test(remainingText)) {
            selects.push({ pos: i, depth: currentDepth });
            i += 6;
        }
    }
    
    return selects;
}

export function getCurrentSelect(selectPositions: Array<{ pos: number; depth: number }>, currentDepth: number): { pos: number; depth: number } | null {
    const sameDepthSelects = selectPositions.filter(s => s.depth === currentDepth);
    if (sameDepthSelects.length === 0) return null;
    return sameDepthSelects.sort((a, b) => b.pos - a.pos)[0];
}

export function extractSelectSegment(fullText: string, selectPos: number): string {
    // FULL 텍스트 사용 (cursorPosition 제한 없이 끝까지 추출 후 WHERE 또는 ) 에서 잘라내기)
    let segment = fullText.substring(selectPos);

    // WHERE 가 있으면 거기까지만 잘라냄
    const whereIdx = segment.toUpperCase().search(/\bWHERE\b/);
    if (whereIdx > 0) {
        segment = segment.substring(0, whereIdx);
    } else {
        // 닫는 괄호가 있으면 거기까지만
        const closeParenIndex = segment.lastIndexOf(')');
        if (closeParenIndex > 0 && closeParenIndex < segment.length - 5) {
            segment = segment.substring(0, closeParenIndex + 1);
        }
    }

    return segment;
}

export function analyzeScope(queryText: string, cursorOffset: number): ScopeInfo {
    const textBeforeCursor = queryText.substring(0, cursorOffset);
    
    let currentDepth = 0;
    for (let i = 0; i < textBeforeCursor.length; i++) {
        if (textBeforeCursor[i] === '(') currentDepth++;
        else if (textBeforeCursor[i] === ')') currentDepth--;
    }
    
    const selectPositions = findSelectsWithDepths(textBeforeCursor);
    const currentSelect = getCurrentSelect(selectPositions, currentDepth);
    
    let currentSelectSegment: string | null = null;
    if (currentSelect) {
        currentSelectSegment = extractSelectSegment(queryText, currentSelect.pos);
    }
    
    return {
        currentDepth,
        selectPositions,
        currentSelectSegment
    };
}

export function extractScopedAliases(queryText: string, cursorOffset: number): ScopedAliasMapping {
    const scope = analyzeScope(queryText, cursorOffset);
    
    if (!scope.currentSelectSegment) {
        console.warn('[extractScopedAliases] No local SELECT segment found, using full query');
        const fullMappings = extractFromClause(queryText);
        return {
            localAliases: fullMappings,
            isNested: false
        };
    }
    
const localAliases = extractFromClause(scope.currentSelectSegment);
    const isNested = scope.currentDepth > 0;
    
    return { localAliases, isNested };
}

export function resolveAliasInScope(alias: string, queryText: string, cursorOffset: number): string | null {
    const scoped = extractScopedAliases(queryText, cursorOffset);
    const tableName = scoped.localAliases[alias.toUpperCase()];
    
    if (!tableName) {
        console.warn(`[resolveAliasInScope] Alias "${alias}" NOT in LOCAL scope. Available: ${Object.keys(scoped.localAliases).join(', ')}`);
        return null;
    }
    
    return tableName;
}
