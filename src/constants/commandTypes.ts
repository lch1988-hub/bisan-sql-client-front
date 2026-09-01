/**
 * SQL 명령어 타입 정의
 * 모든 탭, 폼, API 요청에서 일관되게 사용됨
 */
export const COMMAND_TYPE = {
    SELECT: 'select' as const,
    EXECUTE: 'execute' as const,
    PROCEDURE: 'procedure' as const,
} as const;

// 타입 자동 추출 (선택사항 - Zod 에서 자동으로 생성됨)
export type CommandTypeValue = typeof COMMAND_TYPE.SELECT | typeof COMMAND_TYPE.EXECUTE | typeof COMMAND_TYPE.PROCEDURE;
