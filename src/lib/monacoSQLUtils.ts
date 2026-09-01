/**
 * Monaco 에디터를 위한 SQL 자동완성 유틸리티 - 레거시 호환성 유지 (불필요한 경우 제거 가능)
 * 
 * 실제로는 @/lib/sqlCompletion/providers 를 직접 사용하세요.
 */

export interface TableColumns {
    [tableName: string]: string[];
}

// 레거시 API - 새 코드에서는 providers.ts 를 직접 사용 권장
export { createCompletionSuggestions } from './sqlCompletion/index';
export { setupMonacoSQLCompletion, setupSQLLanguage } from './sqlCompletion/providers';
