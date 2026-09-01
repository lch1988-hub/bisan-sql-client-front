'use client';

import React, {useMemo, useState} from 'react';
import {AgGridReact, AgGridProvider} from 'ag-grid-react';
import {AllCommunityModule, themeQuartz} from 'ag-grid-community';
import {provideGlobalGridOptions} from 'ag-grid-community';

provideGlobalGridOptions({
  theme: themeQuartz,
  defaultColDef: {
    sortable: true,
    filter: true,
  },
}, 'deep');

interface DynamicGridProps {
    data: any[] | null | undefined;
    columns?: string[];  // 백엔드에서 보낸 컬럼 순서 (선택)
    height?: string;
    onRowClick?: (row: any) => void;
    className?: string;
}

export default function DynamicSharedGrid({
                                              data,
                                              columns: columnOrder,  // 백엔드에서 보낸 컬럼 순서 (선택)
                                              height = '800px',
                                              onRowClick,
                                              className = ''
                                          }: DynamicGridProps) {
    
    // Next.js SSR 호환성: client-only 컴포넌트 표시
    const [gridApi, setGridApi] = useState<object | null>(null);

    const exportToCsv = () => {
        if (!gridApi || !data || data.length === 0) {
            console.warn('CSV 다운로드 대기 중: 그리드 또는 데이터가 아직 초기화되지 않았습니다.');
            return;
        }

        const gridInstance = gridApi as any;

        console.log('AG-Grid CSV 다운로드 시작...');

        try {
            gridInstance.exportDataAsCsv({
                allColumns: true,
                onlySelected: false,
                suppressQuotes: false,
                columnSeparator: ',',
                fileName: 'query-result.csv'
            });

            console.log(' CSV 다운로드 완료');
        } catch (error) {
            console.error('CSV 다운로드 중 오류:', error);
            alert('CSV 다운로드 중 오류가 발생했습니다!');
        }
    };

    const dynamicColumnDefs = useMemo(() => {
        if (!data || !Array.isArray(data) || data.length === 0) return [];

        try {
            const firstRow = data[0];

            if (!firstRow || typeof firstRow !== 'object') {
                // console.warn(' [DynamicGrid] 첫 번째 행이 객체가 아님:', firstRow);
                return [];
            }

            // console.log('\n=== [Next.js DynamicSharedGrid] 컬럼 순서 디버깅 ===');
            
            // 백엔드에서 보낸 columns 배열의 순서를 따르거나, 그렇지 않으면 모든 키 사용
            const keys = columnOrder && columnOrder.length > 0 
                ? columnOrder  // 백엔드 순서 우선
                : Object.keys(firstRow);  // fallback: 객체 키
            
            // console.log('백엔드에서 받은 columns:', columnOrder?.slice(0, 10));
            // console.log('Object.keys(firstRow) 로 추출한 키들:', Object.keys(firstRow).slice(0, 10));
            // console.log('최종 렌더링할 컬럼 순서 (keys):', keys.slice(0, 10));
            
            // 백엔드와 Object.keys 의 차이 확인
            if (columnOrder && columnOrder.length > 0) {
                const objectKeys = Object.keys(firstRow);
                const isSameOrder = JSON.stringify(keys) === JSON.stringify(objectKeys);
                // console.log('백엔드 순서 vs Object.keys 순서가 동일한가?', isSameOrder);
                
                if (!isSameOrder && Math.min(keys.length, objectKeys.length) > 0) {
                    // console.log('차이 상세:');
                    for (let i = 0; i < Math.min(10, keys.length, objectKeys.length); i++) {
                        const key = keys[i];
                        const objectKeyAtIndex = objectKeys[i];
                        if (key !== objectKeyAtIndex) {
                            // console.log(`  [${i}] 백엔드="${key}" vs Object.keys="${objectKeyAtIndex}" - 불일치!`);
                        }
                    }
                } else {
                    // console.log(' 컬럼 순서가 동일함');
                }
            }

            return keys.map((key) => {
                // 키가 행 데이터에 존재하는지 확인 (부족한 경우 skip)
                if (!(key in firstRow)) {
                    console.warn(` [DynamicGrid] 컬럼 "${key}" 가 행 데이터에 없음, 건너뜀`);
                    return null;
                }

                const config: any = {
                    headerName: key.toUpperCase().replace(/^[A-Z]/, (c: string) => c),
                    field: key,
                };

                if (typeof firstRow[key] === 'number') {
                    config.cellStyle = {textAlign: 'right'};
                }

                if (key === 'STATUS') {
                    config.cellStyle = {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: firstRow[key] === '선택됨' ? '#2563eb' : '#6b7280'
                    };
                }

                return config;
            }).filter((col): col is NonNullable<typeof col> => col !== null);  // null 제거
        } catch (err) {
            console.error(' [DynamicGrid] 컬럼 생성 중 에러:', err);
            return [];
        }
    }, [data, columnOrder]);  // columnOrder 를 의존성 배열에 추가

    const defaultColDef = useMemo(() => ({
        flex: 1,
        minWidth: 120,
        sortable: true,
        filter: true,
        resizable: true
    }), []);

    if (!data) {
        return <div className="p-5 text-center">데이터를 기다리는 중입니다...</div>;
    }
    
    const rowSelection = useMemo(() => {
      return {
        mode: 'multiRow',
        enableClickSelection: true,
      } as const;
    }, []);

    return (
        <AgGridProvider modules={[AllCommunityModule]}>
            <div className={`ag-theme-quartz h-full w-full ${className}`} style={{height: height, width: '100%', display: 'flex', flexDirection: 'column'}}>
                <AgGridReact
                    rowData={data}
                    columnDefs={dynamicColumnDefs}
                    defaultColDef={defaultColDef}
                    pagination={false} // 페이지네이션 제거 - 모두 표시
                    animateRows={true}
                    onGridReady={(params) => {
                        console.log(' 그리드 API 초기화됨');
                        setGridApi(params.api);
                    }}
                    onRowClicked={(params) => {
                        if (onRowClick && params.data) {
                            onRowClick(params.data);
                        }
                    }}
                    enableCellTextSelection={true}
                    ensureDomOrder={true}
                    rowSelection={rowSelection}
                    className="flex-1"
                />

                <div className="mt-auto h-9 flex items-center justify-end px-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={exportToCsv}
                        disabled={!data || data.length === 0 || !gridApi}
                        className={`h-6 px-3 text-xs rounded transition-colors ${
                            (!data || data.length === 0 || !gridApi)
                                ? 'bg-gray-200 dark:bg-slate-600 cursor-not-allowed text-gray-500'
                                : 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                        }`}
                    >
                        CSV 다운로드
                    </button>
                </div>
            </div>
        </AgGridProvider>
    );
}
