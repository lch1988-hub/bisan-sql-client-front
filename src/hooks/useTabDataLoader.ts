'use client';

import { useEffect, useCallback, useState } from 'react';
import { restoreQueryResult } from '@/lib/storage';
import {ParsedSelectData} from "@/schemas/formSchema";

/**
 * 탭 데이터를 IndexedDB 에서 로드하는 custom hook
 */
export function useTabDataLoader(activeTabId: string | null, activeTabData: ParsedSelectData | null, lastUpdated?: number) {
    // 대용량 데이터 로드 상태 관리
    const [fullDataLoading, setFullDataLoading] = useState(false);
    const [loadedFullData, setLoadedFullData] = useState<ParsedSelectData | null>(null);

    /**
     * 탭 의 데이터를 IndexedDB 에서 로드 (항상 전체 데이터 가져옴)
     */
    const loadDataFromIndexedDB = useCallback(async () => {
        if (!activeTabId) {
            console.warn('activeTabId 가 없습니다');
            return;
        }

        setFullDataLoading(true);
        
        try {
            const totalCount = activeTabData?.total_count || '알 수 없음';
            console.log(` IndexedDB 에서 (${totalCount}건) 로드 중...`);
            
            const fullResult = await restoreQueryResult(activeTabId);
            
            if (!fullResult) {
                console.log(`IndexedDB 에 저장된 데이터가 없습니다 (tabId: ${activeTabId})`);
                // 원래 activeTabData 가 있으면 그대로 유지
                setLoadedFullData(activeTabData ?? null);
                return;
            }

            // console.log(` IndexedDB 에서 복원됨: ${fullResult.rows?.length || 0}행, total_count: ${fullResult.total_count}`);
            
            // 전체 행 또는 columns 만 포함한 데이터 반환
            setLoadedFullData(fullResult);
            
            const actualRowsCount = fullResult.rows?.length || 0;
            const actualTotalCount = fullResult.total_count || 0;
            
            if (actualRowsCount === actualTotalCount) {
                console.log(`IndexedDB 에서 ${actualRowsCount}행 전체 로드 완료`);
            } else if (fullResult.rows && actualRowsCount > 0) {
                console.log(`부분적 로드: ${actualRowsCount}/${actualTotalCount} 행 표시`);
            }
        } catch (error) {
            console.error('IndexedDB 로드 실패:', error);
            
            // 에러 시 activeTabData 로 복구
            if (activeTabData) {
                setLoadedFullData({
                    ...activeTabData,
                    rows: activeTabData.rows || [],
                });
            } else {
                setLoadedFullData(null);
            }
        } finally {
            setFullDataLoading(false);
        }
    }, [activeTabId, activeTabData]);

    // 탭이 변경될 때마다 (초기화 또는 데이터 업데이트 시) 모든 데이터를 IndexedDB 에서 로드
    useEffect(() => {
        if (!activeTabId) return;
        
        console.log(' 탭 변경/데이터 갱신 감지, IndexedDB 로드 시작...');
        void loadDataFromIndexedDB();
    }, [activeTabId, lastUpdated]); // lastUpdated 추가 - 데이터 업데이트 시 재트리거

    return {
        fullDataLoading,
        loadedFullData,
        refreshData: loadDataFromIndexedDB,
    };
}
