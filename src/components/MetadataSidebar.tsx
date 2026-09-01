'use client';

import React, { useState } from 'react';
import { useMetadataStore } from '@/stores/metadataStore';
import DynamicSharedGrid from './DynamicSharedGrid';
import { tablesToGridData, columnDetailsToGridData } from '@/utils/tableMetadataUtils';

export const MetadataSidebar: React.FC = () => {
    const { fetchMetadata, loading, error, tables, columnsByTable } = useMetadataStore();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);

    // 테이블 목록은 이미 정렬되어 백엔드에서 전달됨

    const handleRefresh = async () => {
        try {
            await fetchMetadata();
        } catch (err) {
            console.error('메타데이터 조회 실패:', err);
        }
    };

    const handleRowClick = (row: { TABLE_NAME?: string }) => {
        if (row.TABLE_NAME) {
            setSelectedTable(row.TABLE_NAME);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
            {/* Header with buttons */}
            <div className="p-3 space-y-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white truncate">
                        테이블 메타데이터
                    </h2>
                    
                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                            loading
                                ? 'bg-gray-300 cursor-not-allowed text-gray-600'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        {loading ? (
                            <span className="flex items-center gap-1">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                로딩중
                            </span>
                        ) : (
                            '조회'
                        )}
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Table Detail View */}
                {selectedTable && (
                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                            {selectedTable} ({columnsByTable[selectedTable]?.length || 0})
                        </h3>
                        <button
                            onClick={() => setSelectedTable(null)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-xs font-medium transition-colors whitespace-nowrap"
                        >
                            목록으로
                        </button>
                    </div>
                )}
            </div>

            {/* Grid Area - flex-1 으로 자동으로 나머지 공간 다 차지하게 함 */}
            <div className="flex-1 overflow-hidden">
                {selectedTable ? (
                    // Table Detail View
                    columnsByTable[selectedTable] && (
                        <DynamicSharedGrid 
                            data={columnDetailsToGridData(columnsByTable[selectedTable])}
                            height="100%"
                            className="!m-0"
                        />
                    )
                ) : (
                    // Table List View
                    <>
                        {tables.length === 0 && !loading && (
                            <div className="h-full flex items-center justify-center text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                                <p className="text-sm text-center px-4">
                                    테이블 정보를 조회하려면<br/>상단 &apos;조회&apos; 버튼을 클릭하세요.
                                </p>
                            </div>
                        )}

                        {tables.length > 0 && (
                            <DynamicSharedGrid 
                                data={tablesToGridData(tables, selectedTable)}
                                height="100%"
                                onRowClick={handleRowClick}
                                className="!m-0"
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
