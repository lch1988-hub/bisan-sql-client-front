import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { getApiUrl } from '@/lib/api'

// ========================================
// 테이블 메타데이터 구조 정의
// ========================================

export interface TableListEntry {
  TABLE_NAME: string;
  TABLE_COMMENTS: string;
}

export interface ColumnDetailEntry {
  COLUMN_NAME: string;
  COLUMNS_COMMENTS: string;
}

export interface MetadataApiResponse {
  success: boolean;
  data?: {
    tables: TableListEntry[];  // 목록용 (정렬된 테이블)
    columnsByTable: Record<string, ColumnDetailEntry[]>;  // 상세用自己
    totalCount: number;  // 테이블 개수
    totalColumns: number;  // 전체 컬럼 개수
  };
  message?: string;
}

// ========================================
// Store 상태 인터페이스
// ========================================

export interface MetadataState {
  tables: TableListEntry[];  // 정렬된 테이블 목록
  columnsByTable: Record<string, ColumnDetailEntry[]>;  // 테이블별 컬럼 상세
  
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  
  fetchMetadata: () => Promise<void>;
  clearMetadata: () => void;
}

// ========================================
// Zustand 스토어 설정
// ========================================

export const useMetadataStore = create<MetadataState>()(
  persist(
    (set) => ({
      tables: [],
      columnsByTable: {},
      loading: false,
      error: null,
      lastUpdated: null,
      
      fetchMetadata: async () => {
        console.log(' [metadataStore] fetchMetadata 호출됨');
        set({ loading: true, error: null });
        
        try {
          const response = await axios.get<MetadataApiResponse>(getApiUrl('/api/table-metadata'));
          console.log(' [metadataStore] API 응답:', response.data);
          
          if (!response.data.success) {
            throw new Error(response.data.message || '메타데이터 조회 실패');
          }
          
          const data = response.data.data;
          console.log(' [metadataStore] 테이블 개수:', data?.totalCount, ', 전체 컬럼 개수:', data?.totalColumns);
          
          set({
            tables: data?.tables || [],
            columnsByTable: data?.columnsByTable || {},
            loading: false,
            lastUpdated: Date.now(),
            error: null,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류 발생';
          console.error(' [metadataStore] 에러:', err);
          
          set({
            loading: false,
            error: errorMessage,
            tables: [],
            columnsByTable: {},
          });
          
          throw err;
        }
      },
      
      clearMetadata: () => {
        set({
          tables: [],
          columnsByTable: {},
          error: null,
          lastUpdated: null,
        });
      },
    }),
    {
      name: 'table-metadata-storage',
      version: 2,
      partialize: (state) => ({
        tables: state.tables,
        columnsByTable: state.columnsByTable,
        lastUpdated: state.lastUpdated,
      }),
      migrate: (persistedState: any, version: number) => {
        if (!persistedState) return {};
        
        if (version === 1) {
          console.log(' [metadataStore] 로컬스토리지 마이그레이션: v1 → v2. 기존 데이터 제거.');
          return {};
        }
        
        return persistedState;
      },
    }
  )
);
