/**
 * IndexedDB Storage Layer - Replaces localStorage for large query results
 * Uses localForage + direct idb for optimal performance with big datasets
 */

'use client';

import { openDB, IDBPDatabase } from 'idb';
import type { ParsedSelectData } from '@/schemas/formSchema';

let db: IDBPDatabase | null = null;

// DB 버전 및 구조 관리
const DB_NAME = 'bisan-sql-db';
const DB_VERSION = 2; // Version bump for new structure
const RESULTS_STORE = 'query-results';
const TABS_CACHE_STORE = 'tabs-cache';

/**
 * IndexedDB 초기화 (싱글톤 패턴)
 */
async function initDB(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(currentDb) {
      // Query results store - 대용량 결과를 위한 저장소
      if (!currentDb.objectStoreNames.contains(RESULTS_STORE)) {
        const resultStore = currentDb.createObjectStore(RESULTS_STORE, {
          keyPath: 'id',
        });
        resultStore.createIndex('timestamp', 'timestamp');
        resultStore.createIndex('tabId', 'tabId'); // 탭별 검색을 위한 인덱스
      }

      // Tabs cache store - 탭 메타데이터 캐싱
      if (!currentDb.objectStoreNames.contains(TABS_CACHE_STORE)) {
        currentDb.createObjectStore(TABS_CACHE_STORE, {
          keyPath: 'tabId',
        });
      }
    },
  });

  return db;
}

// ============================================
// Query Results - 대용량 쿼리 결과 저장/복원
// ============================================

export interface CachedResult {
  id: string; // tabId + queryKey 조합
  tabId: string;
  data: ParsedSelectData; // ParsedSelectData 전체 객체
  timestamp: number;
  rowCount: number;
}

/**
 * 쿼리 결과를 IndexedDB 에 저장 (비동기, 대용량 최적화)
 */
export async function saveQueryResult(
  tabId: string,
  data: ParsedSelectData,
  queryKey?: string
): Promise<void> {
  try {
    const resultDb = await initDB();
    const id = queryKey ? `${tabId}:${queryKey}` : tabId;
    const rowCount = data?.rows?.length || 0;

    await resultDb.put(RESULTS_STORE, {
      id,
      tabId,
      data,
      timestamp: Date.now(),
      rowCount,
    });
  } catch (error) {
    console.error('IndexedDB 저장 실패:', error);
    throw error;
  }
}

/**
 * 저장된 쿼리 결과 복원 (대용량 데이터 처리)
 * 50 행 이상이면 columns 만 복원, rows 는 빈 배열로 (기존 로직 유지)
 */
export async function restoreQueryResult(tabId: string): Promise<ParsedSelectData | null> {
  try {
    const resultDb = await initDB();
    
    // tabId 로 검색하기 위해 모든 결과를 가져온 후 필터링
    const allCached: CachedResult[] = await resultDb.getAll(RESULTS_STORE);
    
    if (!allCached || allCached.length === 0) {
      return null;
    }

    // 해당 탭의 최신 결과 선택 (tabId 로 필터링)
    const tabResults = allCached.filter(item => item.tabId === tabId);
    
    if (tabResults.length === 0) {
      console.warn(`Tab [${tabId}] 에 저장된 결과를 찾을 수 없음`);
      return null;
    }
    
    // 최신 결과 선택
    const cached = tabResults.sort((a, b) => 
      b.timestamp - a.timestamp
    )[0] as CachedResult;

    // console.log(` IndexedDB 에서 복원됨: ${cached.rowCount}행 (${tabId})`);
    
    // 전체 데이터 반환 (UI 에서는 조건부 렌더링)
    return cached.data;
  } catch (error) {
    console.error('IndexedDB 복원 실패:', error);
    throw error;
  }
}

// ============================================
// Tabs Cache - 탭 메타데이터 캐싱
// ============================================

export interface CachedTabMetadata {
  tabId: string;
  name: string;
  sql: string;
  cmdType: string;
  timestamp: number;
}

/**
 * 탭 메타데이터 저장 (SQL 쿼리문 등은 항상 저장)
 */
export async function saveTabMetadata(metadata: CachedTabMetadata): Promise<void> {
  try {
    const dbInstance = await initDB();
    
    await dbInstance.put(TABS_CACHE_STORE, {
      ...metadata,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('탭 메타데이터 저장 실패:', error);
  }
}

/**
 * 탭 메타데이터 복원
 */
export async function restoreTabMetadata(tabId: string): Promise<CachedTabMetadata | null> {
  try {
    const dbInstance = await initDB();
    
    return await dbInstance.get(TABS_CACHE_STORE, tabId) as CachedTabMetadata | null;
  } catch (error) {
    console.error('탭 메타데이터 복원 실패:', error);
    return null;
  }
}

// ============================================
// 유틸리티 함수들
// ============================================

/**
 * 특정 탭의 쿼리 결과 삭제 (탭 닫기 사용)
 */
export async function clearQueryResult(tabId: string): Promise<void> {
  try {
    const resultDb = await initDB();
    
    // tabId 로 연결된 모든 결과 삭제
    const allResults: CachedResult[] = await resultDb.getAll(RESULTS_STORE);
    const tabResults = allResults.filter(item => item.tabId === tabId);
    
    for (const result of tabResults) {
      await resultDb.delete(RESULTS_STORE, result.id);
    }
  } catch (error) {
    console.error('쿼리 결과 삭제 실패:', error);
    throw error;
  }
}

/**
 * 오래된 데이터 정리 (보존 기간: 7 일)
 */
export async function clearExpiredData(daysToKeep: number = 7): Promise<void> {
  try {
    const resultDb = await initDB();
    const cutoffDate = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    // 쿼리 결과 정리
    const oldResults: CachedResult[] = await resultDb.getAll(RESULTS_STORE);
    
    for (const result of oldResults) {
      if (result.timestamp < cutoffDate) {
        await resultDb.delete(RESULTS_STORE, result.id);
      }
    }

    // 탭 메타데이터 정리
    const oldTabs: CachedTabMetadata[] = await resultDb.getAll(TABS_CACHE_STORE);
    
    for (const tab of oldTabs) {
      if (tab.timestamp < cutoffDate) {
        await resultDb.delete(TABS_CACHE_STORE, tab.tabId);
      }
    }
  } catch (error) {
    console.error('오래된 데이터 정리 실패:', error);
  }
}

/**
 * 모든 캐시된 결과 삭제 (크롬 개발자 도구의 IndexedDB 확인 시)
 */
export async function clearAllResults(): Promise<void> {
  try {
    const dbInstance = await initDB();
    
    // 결과를 먼저 지움 (트랜잭션 순서 중요)
    await dbInstance.clear(RESULTS_STORE);
  } catch (error) {
    console.error('데이터 삭제 실패:', error);
  }
}

/**
 * DB 상태 확인 (디버깅용)
 */
export async function getStorageStats(): Promise<{
  resultCount: number;
  tabMetadataCount: number;
  oldestResult?: CachedResult['timestamp'];
}> {
  const dbInstance = await initDB();
  
  const results = await dbInstance.getAll(RESULTS_STORE);
  const tabs = await dbInstance.getAll(TABS_CACHE_STORE);

  return {
    resultCount: results.length,
    tabMetadataCount: tabs.length,
    oldestResult: results.sort((a, b) => 
      a.timestamp - b.timestamp
    )[0]?.timestamp,
  };
}

export default initDB;
