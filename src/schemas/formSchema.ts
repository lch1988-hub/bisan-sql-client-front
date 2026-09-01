import { z } from 'zod';
import { COMMAND_TYPE, type CommandTypeValue } from '../constants/commandTypes';

// Zod 스키마 - 상수 기반 타입 안전성 확보

export const formSchema = z.object({
    sql: z.string()
        .min(1, 'SQL 을 입력해주세요!')
        .max(5000, 'SQL 이 너무 깁니다 (최대 5000 자)'),
    scrollPos: z.number()
        .int('scrollPos 는 정수여야 합니다')
        .min(0, 'scrollPos 은 0 이상의 정수여야 합니다')
        .default(0) as any, // Zod default 를 타입이 인식하지 못해 any 로 우회

    cmdType: z.nativeEnum(COMMAND_TYPE).default('select' as CommandTypeValue),
    runAllQueries: z.boolean().default(false),
    
    fromPos: z.number()
        .int('fromPos 는 정수여야 합니다+')
        .min(0, 'fromPos 은 0 이상의 정수여야 합니다')
        .max(1000, 'fromPos 이 너무 큽니다 ( 최대 1000)')
        .default(0),
    
    toPos: z.number()
        .int('toPos 는 정수여야 합니다+')
        .min(0, 'toPos 은 0 이상의 정수여야 합니다')
        .max(100, 'toPos 이 너무 큽니다 ( 최대 100)')
        .default(10),
});

export type FormValues = z.infer<typeof formSchema>;

export interface ParsedSelectData {
    columns: string[];
    rows: Record<string, string | number | null>[];
    total_count: number;
    
    fetchedPositions?: number[];
    stoppedAt?: number;
    stopReason?: 'error' | 'empty' | 'timeout' | 'max_reached';
    
    has_more: boolean;
    message?: string;
}

export interface PartialData {
    columns: string[];
    rows: Record<string, string | number | null>[];
    totalCount: number;
    stoppedAt: number;
    stopReason: 'error' | 'empty' | 'timeout' | 'network_error';
    fetchedPositions?: number[];
}

export interface ApiResponse {
    cmd: 'select' | 'execute';
    success: boolean;
    data?: ParsedSelectData;
    result?: string;
    partialData?: PartialData;
    message?: string;
}
