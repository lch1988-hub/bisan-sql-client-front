/**
 * Scope Stack Architecture for Nested Query Parsing
 * 
 * Resolves nested SQL query context by maintaining a depth-indexed scope stack.
 * Each SELECT statement creates a new scope with its own clauses (FROM, WHERE, etc.).
 * Cursor position determines which scope is "active" and which keyword belongs to it.
 * 
 * Key Innovation: Unlike linear scan approach, this ensures inner/outer keywords
 * are never confused by organizing them into separate SelectScope objects.
 */

import { maskNonSqlText } from './sqlMasker';

export interface ScopeClause {
  type: 'SELECT' | 'FROM' | 'WHERE' | 'GROUP_BY' | 'HAVING' | 'ORDER_BY' | 
        'CONNECT_BY' | 'START_WITH' | 'JOIN' | 'PIVOT' | 'UNPIVOT';
  keyword: string;         // Exact text: "FROM", "WHERE", etc.
  position: number;        
  endIndex?: number;       
}

export interface SelectScope {
  scopeId: number;
  depth: number;                       
  selectPosition: number;             
  clauses: ScopeClause[];              
  childScopes?: number[];              
}

export interface ParsedQueryStack {
  scopesByDepth: (SelectScope | null)[];  
  maxDepth: number;
  cursorContext: CursorContextResult;    
}

export interface CursorContextResult {
  cursorPosition: number;  
  calculatedDepth: number;   
  activeScope: SelectScope | null;
  lastKeyword: ScopeClause | null; 
  isInSubQueryInsideCurrentSelect: boolean;
}

interface ParseState {
  query: string;
  scopesByDepth: (SelectScope | null)[];    
  currentPos: number;
  parenDepth: number;
  inStringLiteral: boolean;
  pendingClausesAtCurrentDepth: ScopeClause[];  
}

const INITIAL_STATE: ParseState = {
  query: '',
  scopesByDepth: [null],
  currentPos: 0,
  parenDepth: 0,
  inStringLiteral: false,
  pendingClausesAtCurrentDepth: []  
};

/**
 * Build the scope stack for a SQL query.
 * Single-pass algorithm that tracks parentheses depth and assigns keywords to scopes.
 */
export function buildScopeStack(query: string, cursorPosition: number): ParsedQueryStack {
  // 주석/문자열 리터럴 마스킹 (길이 보존) - 주석 내 키워드가 절 판정에 오염되는 것 방지
  query = maskNonSqlText(query);
  const state = { ...INITIAL_STATE, query };
  const keywordsFound: Array<{ keyword: string; position: number; depth: number }> = [];
  
  // Match SQL keywords (Oracle syntax supported, including WITH for CTE and PIVOT/UNPIVOT)
  const searchRegex = /\b(WITH|SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|CONNECT BY|START WITH|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|PIVOT|UNPIVOT)\b/gi;
  
  let match: RegExpExecArray | null;
  while ((match = searchRegex.exec(query)) !== null) {
    const keywordText = match[1].toUpperCase();
    keywordsFound.push({
      keyword: keywordText,
      position: match.index,
      depth: calculateParensBeforePosition(query, match.index)
    });
  }
  
  // Build structured scopes from linear scans
  for (const { keyword, position, depth } of keywordsFound) {
    if (!state.scopesByDepth[depth]) {
      state.scopesByDepth[depth] = null;
    }
    
    if (keyword === 'SELECT') {
      const newScope: SelectScope = {
        scopeId: Date.now() + Math.floor(Math.random() * 1000000),
        depth,
        selectPosition: position,         
        clauses: [],  
        childScopes: []
      };
      
      // If same depth already has a SELECT, it's nested inside another query at that level
      if (state.scopesByDepth[depth] !== null) {
        const parentDepth = depth - 1;
        let actualParentScope = state.scopesByDepth[parentDepth] || null;  
        
        // Walk up to find nearest non-null parent
        for (let d = parentDepth; d >= 0; d--) {
          if (state.scopesByDepth[d]) {
            actualParentScope = state.scopesByDepth[d]!;  
            break;
          }
        }
        
        if (actualParentScope) {
          actualParentScope.childScopes = [...(actualParentScope.childScopes || []), newScope.scopeId];
        }
      }
      
      state.scopesByDepth[depth] = newScope;  
    } 
    else if (isClauseKeyword(keyword)) {
      const activeScope = state.scopesByDepth[depth] || state.scopesByDepth[0];
      if (!activeScope) continue; // Skip malformed queries
      
      // Fix endpoint of previous clause in this scope  
      updatePreviousClauseEndpoint(activeScope.clauses, position);
      
      activeScope.clauses.push({
        type: mapKeywordToClauseType(keyword),
        keyword, 
        position  
      });
    }
  }
  
  const calculatedCursorDepth = calculateParensBeforePosition(query, cursorPosition);
  
  // Determine active scope based on cursor context
  const { activeScope, lastKeyword, isInSubQueryInsideCurrentSelect } = resolveActiveScope(
    state.scopesByDepth, 
    calculatedCursorDepth, 
    query, 
    cursorPosition
  );
  
  return {
    scopesByDepth: state.scopesByDepth,    
    maxDepth: Math.max(0, state.scopesByDepth.length - 1),
    cursorContext: {
      cursorPosition,
      calculatedDepth: calculatedCursorDepth,
      activeScope,  
      lastKeyword,
      isInSubQueryInsideCurrentSelect  
    }
  };
}

/**
 * Calculate parentheses depth at a specific position in query.
 * Depth = number of open parens before this position minus closed ones.
 */
function calculateParensBeforePosition(query: string, position: number): number {
  let depth = 0;
  for (let i = 0; i < position; i++) {
    if (query[i] === '(') depth++;
    else if (query[i] === ')') depth--;
  }
  return Math.max(0, depth);  
}

/**
 * Map SQL keyword to clause type for internal representation.
 */
function mapKeywordToClauseType(keyword: string): ScopeClause['type'] {
  const K = keyword.toUpperCase();
  switch (K) {
    case 'FROM': return 'FROM';
    case 'WHERE': return 'WHERE';
    case 'GROUP BY': return 'GROUP_BY';
    case 'HAVING': return 'HAVING';
    case 'ORDER BY': return 'ORDER_BY';
    case 'CONNECT BY': return 'CONNECT_BY';
    case 'START WITH': return 'START_WITH';
    case 'PIVOT': return 'PIVOT';
    case 'UNPIVOT': return 'UNPIVOT';
    case 'JOIN': 
    case 'LEFT JOIN':
    case 'RIGHT JOIN': 
    case 'INNER JOIN': return 'JOIN';
    default: return 'SELECT';  
  }
}

/**
 * Check if keyword starts a new SQL clause.
 */
function isClauseKeyword(keyword: string): boolean {
  const K = keyword.toUpperCase();
  return ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 
          'ORDER BY', 'CONNECT BY', 'START WITH',
          'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
          'INNER JOIN', 'PIVOT', 'UNPIVOT'].includes(K);
}

/**
 * Update the end position of the previous clause when a new one is found.
 */
function updatePreviousClauseEndpoint(clauses: ScopeClause[], newPosition: number) {
  const clauseToUpdate = clauses[clauses.length - 1];
  if (clauseToUpdate && !clauseToUpdate.endIndex) {
    clauseToUpdate.endIndex = newPosition;  
  }
}

/**
 * Determine which scope is active at cursor position.
 * Returns the SELECT statement and its most recent keyword before the cursor.
 */
function resolveActiveScope(
  scopesByDepth: (SelectScope | null)[], 
  calculatedCursorDepth: number, 
  query: string, 
  cursorPosition: number
): { activeScope: SelectScope | null; lastKeyword: ScopeClause | null; isInSubQueryInsideCurrentSelect: boolean } {
  
  const remainingQuery = query.substring(cursorPosition);
  const firstClosingParenIndex = remainingQuery.indexOf(')');
  const hasUnresolvedClosingParen = firstClosingParenIndex === -1; 
  
  let actualDepth = calculatedCursorDepth; 
  let activeScope: SelectScope | null = scopesByDepth[actualDepth]; 
  
  // If no scope at current depth, look for parent scope (we might be after closing paren)
  if (!activeScope && actualDepth > 0) {
    for (let d = Math.max(0, actualDepth - 1); d >= 0; d--) {  
      if (scopesByDepth[d]) {
        activeScope = scopesByDepth[d]!;
        actualDepth = d;
        break;
      }
    }
  }
  
  // Find the most recent keyword in the active scope before cursor position
  // CRITICAL FIX: For nested queries, do NOT fallback to parent scopes - 
  // inner query's keywords are independent from outer query (Oracle scoping rules)
  let lastKeyword: ScopeClause | null = null;
  
  if (activeScope && activeScope.clauses.length > 0) {
    lastKeyword = findLastClauseBeforePosition(activeScope.clauses, cursorPosition, query);
  } else if (!activeScope) {
    // Only fallback to parent scopes when there's NO active scope at all
    // (e.g., after closing paren has been processed)
    lastKeyword = determineFallbackFromParentScopes(scopesByDepth, actualDepth - 1, calculatedCursorDepth);
  }

  return {
    activeScope: activeScope || null,
    lastKeyword,
    isInSubQueryInsideCurrentSelect: hasUnresolvedClosingParen && !!activeScope  
  };
}

/**
 * Find the most recent clause that appears before cursor position.
 * FIXED: Handle boundary conditions (START WITH → CONNECT BY, HAVING → ORDER BY)
 */
function findLastClauseBeforePosition(
  clauses: ScopeClause[], 
  cursorPosition: number,
  query: string
): ScopeClause | null {
  let latest: ScopeClause | null = null;
  
  for (const clause of clauses) {
    if (clause.position < cursorPosition && (!latest || clause.position > latest.position)) {
      // FIX #H1: START WITH → CONNECT BY boundary check
      // If we found START WITH, check if there's a CONNECT BY keyword later in the query
      // and whether cursor is BEFORE or AFTER it
      if (clause.keyword === 'START WITH') {
        const connectByPos = query.indexOf('CONNECT BY', clause.position);
        
        if (connectByPos >= 0) {
          // CONNECT BY exists - compare positions
          if (cursorPosition <= connectByPos) {
            // Cursor is BEFORE or AT CONNECT BY position → still in START WITH context
            latest = clause;
            continue;  // Don't look for later clauses, we're definitely in START WITH
          } else {
            // Cursor is past CONNECT BY - skip this and let CONNECT BY be detected instead
            continue;
          }
        }
      }
      
      // FIX #56: HAVING → ORDER BY boundary check  
      if (clause.keyword === 'HAVING') {
        const orderByPos = query.indexOf('ORDER BY', clause.position);
        
        if (orderByPos >= 0 && cursorPosition <= orderByPos) {
          // Cursor is before ORDER BY keyword - still in HAVING content area
          latest = clause;
          continue;  // Don't let ORDER BY override when cursor hasn't passed it yet
        }
      }
      
      // No boundary condition applies, accept this clause as the most recent
      latest = clause;
    }
  }
  
  return latest;
}

/**
 * Fallback when no valid scope is found - search parent scopes.
 */
function determineFallbackFromParentScopes(
  scopesByDepth: (SelectScope | null)[], 
  startingDepth: number,
  originalCursorDepth: number
): ScopeClause | null {
  for (let d = startingDepth; d >= 0; d--) {
    const scope = scopesByDepth[d];
    if (scope && scope.clauses.length > 0) {
      // Return the latest clause in this parent scope
      return scope.clauses[scope.clauses.length - 1];
    }
  }
  
  return null;
}
