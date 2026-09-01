'use client';

import { useEffect, useCallback } from 'react';
import { useMetadataStore } from '@/stores/metadataStore';

/**
 * Monaco 에디터와의 메타데이터 동기화를 관리하는 custom hook
 * 자동완성 키워드 바인딩 및 변경 감지 담당
 */
export function useMetadataSync(options: { 
  triggerAutocomplete?: boolean; 
  loggerPrefix?: string 
} = {}) {
  const { triggerAutocomplete = true, loggerPrefix = '[ActiveEditor]' } = options;

  // 메타데이터 동기화 함수
  const syncMetadata = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const tables = useMetadataStore.getState().tables;
    const columnsByTable = useMetadataStore.getState().columnsByTable;
    
    if (!tables || tables.length === 0) {
      console.log(`${loggerPrefix} 메타데이터 없음`);
      return null;
    }

    const tableNames: string[] = [];
    const tableColumns: Record<string, string[]> = {};
    
    tables.forEach((table: { TABLE_NAME: string }) => {
      const tableName = table.TABLE_NAME;
      const columns = columnsByTable[tableName]?.map((col: { COLUMN_NAME: string }) => col.COLUMN_NAME) || [];
      
      if (columns.length > 0) {
        // 대문자로 정규화하여 저장
        const upperCaseName = tableName.toUpperCase();
        
        tableNames.push(upperCaseName);
        tableColumns[upperCaseName] = columns.filter(Boolean);
      }
    });

    // Monaco 가 참조하는 전역 변수 설정
    (window as any).sqlAutoCompleteKeywords = tableNames;
    (window as any).sqlTableColumns = tableColumns;
    
    console.log(`${loggerPrefix} 메타데이터 바인딩:`, { 
      tables: tableNames.length,
      sampleTables: Object.keys(tableColumns).slice(0, 5),
      totalColumnCount: Object.values(tableColumns).flat().length
    });

    return { tableNames, tableColumns };
  }, [loggerPrefix]);

  // 메타데이터 변경 감지 및 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;

    syncMetadata();
    
    const unsubscribe = useMetadataStore.subscribe(
      (newState, prevState) => {
        if (newState.tables !== prevState?.tables || 
            newState.columnsByTable !== prevState?.columnsByTable) {
          console.log(`${loggerPrefix} 메타데이터 변경 감지:`, 
            newState.tables ? newState.tables.length : 0);
          
          syncMetadata();
          
          // Monaco 자동완성 트리거 (옵션)
          if (triggerAutocomplete) {
            const monacoRef = (window as any).monacoInstanceRef;
            if (monacoRef?.editor) {
              try {
                monacoRef.editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
              } catch (e) {
                // ignore 트리거 실패
              }
            }
          }
        }
      }
    );

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [syncMetadata, triggerAutocomplete, loggerPrefix]);

  // 외부에서 수동으로 메타데이터 동기화를 트리거하고 싶을 때 사용
  const forceSync = useCallback(() => {
    return syncMetadata();
  }, [syncMetadata]);

  return {
    forceSync,
  };
}
