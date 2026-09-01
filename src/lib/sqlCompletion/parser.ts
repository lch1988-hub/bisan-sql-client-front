/**
 * SQL 파서 진입점 - clause 분석 및 테이블 추출 유틸리티
 * 제언 생성 로직은 별도의 suggestions 모듈로 분리됨:
 * - where-suggestions.ts: WHERE 절 전용
 * - from-suggestions.ts: FROM 절 전용  
 * - select-suggestions.ts: SELECT-only(선택 절) 전용
 */

// Clause Analyzer
export {
    findKeywordPosition,
    analyzeSQLClauses,
    extractFROMClauseContent,
    type KeywordWithContextInfo
} from './clause-analyzer';

// Table Extractor
export type { TableExtractionResult } from './table-extractor';
export {
    extractTableFromFROMClause,
    extractTableFromSelectOnly
} from './table-extractor';

// Alias Resolver  
export type { TableResolutionResult } from './alias-resolver';
export { resolveAliasInWHERE } from './alias-resolver';

// Types (types.ts 에서 ParsingResult import)
import type { ParsingResult } from './types';
export type { ParsingResult };
