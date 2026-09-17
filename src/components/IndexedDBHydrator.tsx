'use client';

import { useEffect } from 'react';
import { useTabsStore } from '@/stores/tabsStore';
import { restoreQueryResult } from '@/lib/storage';

/**
 * IndexedDB 에서 쿼리 결과를 복원하는 컴포넌트
 * root layout 에 포함되며 SSR 시 아무 작업도 하지 않음 (useEffect 내부 조건문)
 */
export default function IndexedDBHydrator() {
  const tabs = useTabsStore((state) => state.tabs);
  const updateTab = useTabsStore((state) => state.updateTab);

  useEffect(() => {
    // 브라우저 환경에서만 실행
    if (typeof window === 'undefined') return;

    // 오래된 캐시 정리 (30 일 기준)
    // void clearExpiredData(30);

    // 각 탭마다 IndexedDB 에서 data 복원 시도
    tabs.forEach(async (tab) => {
      if (!tab.id || tab.data) return; // 이미 data 가 있거나 유효하지 않은 탭은 건너뛰기

      try {
        const cachedData = await restoreQueryResult(tab.id);

        if (cachedData) {
          // 복원된 data 로 탭 업데이트
          updateTab(tab.id, { data: cachedData });
        }
      } catch (error) {
        console.error(` [${tab.name}] IndexedDB 복구 실패:`, error);
      }
    });
  }, []); // tabs 가 변경될 때마다 다시 복원하지 않도록 빈 의존성 배열 사용 (초기 로드 시만)

  return null; // UI 렌더링 하지 않음
}
