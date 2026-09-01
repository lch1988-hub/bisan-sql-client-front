'use client';

import React, { useState } from 'react';
import { useMetadataStore } from '@/stores/metadataStore';
import DynamicSharedGrid from './DynamicSharedGrid';
import { tablesToGridData, columnDetailsToGridData } from '@/utils/tableMetadataUtils';

export default function TableMetadataViewer() {
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

    const handleRowClick = (row: any) => {
        if (row.TABLE_NAME) {
            setSelectedTable(row.TABLE_NAME);
        } else {
            console.error('[handleRowClick] TABLE_NAME 이 없음:', row);
        }
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">테이블 메타데이터 조회</h2>
                
                <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        loading
                            ? 'bg-gray-300 cursor-not-allowed text-gray-600'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            로딩중...
                        </span>
                    ) : (
                        '테이블 정보 조회'
                    )}
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700 font-medium">메타데이터 조회 실패</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
            )}

            {/* Success Message */}
            {!loading && !error && tables.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                        총 {tables.length}개의 테이블을 조회했습니다.
                    </p>
                </div>
            )}

            {/* Table Detail View */}
            {selectedTable ? (
                <div className="space-y-4 h-full flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b pb-3">
                        <h3 className="text-xl font-semibold text-gray-800">
                            {selectedTable} - 컬럼 목록 ({columnsByTable[selectedTable]?.length || 0})
                        </h3>
                        <button
                            onClick={() => setSelectedTable(null)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                        >
                             목록으로 돌아가기
                        </button>
                    </div>

                    {columnsByTable[selectedTable] && (
                        <div className="flex-1 overflow-hidden mt-4">
                            <DynamicSharedGrid 
                                data={columnDetailsToGridData(columnsByTable[selectedTable])}
                                height="500px"
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* Table List View */
                <div className="space-y-4">
                    {tables.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-8">
                            테이블 정보를 조회하려면 상단 버튼을 클릭하세요.
                        </p>
                    )}

                    {tables.length > 0 && (
                        <DynamicSharedGrid 
                            data={tablesToGridData(tables, selectedTable)}
                            height="550px"
                            onRowClick={handleRowClick}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
