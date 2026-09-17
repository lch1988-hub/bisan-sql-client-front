'use client';

import React from 'react';
import type { ParsedSelectData } from '@/schemas/formSchema';
import DynamicSharedGrid from '../DynamicSharedGrid';

interface ResultDisplayProps {
    hasMounted: boolean;
    activeTab?: {
        isError?: boolean;
        errorMessage?: string;
        result?: string | null;  // null 도 받을 수 있도록 수정
        data?: ParsedSelectData | null;
        sql: string;
    } | null;
    fullDataLoading: boolean;
    loadedFullData: ParsedSelectData | null;
    panelHeight?: number; // 패널 높이 전달 받음
}

/**
 * SQL 실행 결과 표시 컴포넌트
 */
export const ResultDisplay: React.FC<ResultDisplayProps> = ({
    hasMounted,
    activeTab,
    fullDataLoading,
    loadedFullData,
}) => {
    if (!hasMounted) {
        return <div className="p-5 text-center"><p className="text-gray-500 dark:text-slate-400">조회된 데이터가 없습니다.</p></div>;
    }

    const displayData = loadedFullData ?? activeTab?.data;
    
    // 에러 메시지 먼저 표시
    if (activeTab?.isError && activeTab.errorMessage) {
        return <div className="p-5 text-center text-red-600 dark:text-red-400 font-medium">{activeTab.errorMessage}</div>;
    }

    // 결과 메시지만 표시 (result 가 있으면 그리드 대신)
    if (activeTab?.result || activeTab?.data?.message) {
        return (
            <>
                {activeTab?.result && (
                    <div className="p-5 text-center text-blue-600 dark:text-blue-400 font-medium">{activeTab.result}</div>
                )}
                {activeTab?.data?.message && (
                    <div className="p-5 text-center text-slate-600 dark:text-slate-300">{activeTab.data.message}</div>
                )}
            </>
        );
    }

    // 데이터가 없으면 메시지 표시
    if (!displayData) {
        return <div className="p-5 text-center"><p className="text-gray-500 dark:text-slate-400">조회된 데이터가 없습니다.</p></div>;
    }

    // 그리드 표시 조건 (rows 가 있거나 columns 와 total_count 있음)
    const hasRows = displayData.rows && displayData.rows.length >= 0;
    const hasColumnsAndCount = displayData.columns?.length && displayData.total_count !== undefined;
    
    if (!hasRows && !hasColumnsAndCount) {
        return <div className="p-5 text-center"><p className="text-gray-500 dark:text-slate-400">조회된 데이터가 없습니다.</p></div>;
    }

    const displayRows = displayData.rows ?? [];
    const totalCount = displayData.total_count ?? displayRows.length;

    if (fullDataLoading) {
        return (
            <div className="mb-4 p-6 text-center bg-blue-50 dark:bg-slate-700 rounded-lg">
                <p className="text-blue-600 dark:text-blue-400 font-medium">
                     IndexedDB 에서 데이터를 로드 중... ({totalCount.toLocaleString()}건)
                </p>
            </div>
        );
    }

    // rows 가 있으면 그리드 표시 (빈 배열이면 빈 그리드 - 0 건 표시)
    return (
        <DynamicSharedGrid 
            data={displayRows}  
            columns={displayData.columns}  // 백엔드에서 보낸 컬럼 순서 전달
            height="100%" // 컨테이너의 전체 높이 사용
        />
    );
};
