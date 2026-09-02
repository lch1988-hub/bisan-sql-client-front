import { create } from 'zustand';
import { persist, type StorageValue, type StateStorage } from 'zustand/middleware';
import { COMMAND_TYPE, type CommandTypeValue } from '../constants/commandTypes';
import { ParsedSelectData } from "../schemas/formSchema";
import { 
  saveQueryResult, 
  restoreQueryResult, 
  saveTabMetadata, 
  restoreTabMetadata,
  clearExpiredData,
  clearQueryResult  // IndexedDB 에서 탭 데이터 삭제 추가
} from '@/lib/storage';

// ========================================
// 탭 데이터 구조 정의
// ========================================

export interface TabData {
    id: string;
    name: string;
    sql: string;
    cmdType: CommandTypeValue;  // 상수 사용!
    scrollPos:number;
    cursorPosition: number;     // 에디터 커서 위치 (offset)
    executeAll:boolean;
    isExecuting?: boolean; // 현재 쿼리 실행 중인지 여부
    result?: string | null;
    data?: ParsedSelectData;
    isError?: boolean;
    errorMessage?: string;
    lastUpdated?: number;  // 데이터 갱신 타임스탬프 (UI 리포인용)
    createdAt: number;
}

const DEFAULT_TAB_ID = 'default-sql-tab';

const createDefaultTab = (id?: string): TabData => ({
    id: id ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: '새 SQL',
    sql: '',
    cmdType: COMMAND_TYPE.SELECT,  // 상수 사용!
    scrollPos:0,
    cursorPosition: 0,
    executeAll:false,
    result: null,
    data: undefined,
    isError: false,
    errorMessage: undefined,
    lastUpdated: Date.now(),
    createdAt: Date.now(),
});

// ========================================
// 탭 관리 인터페이스
// ========================================

export interface TabsState {
    tabs: TabData[];
    activeTabId: string | null;
    
    addTab: () => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    switchTab: (direction: 'left' | 'right') => void;
    updateTab: (id: string, updates: Partial<TabData>) => void;
    clearAllTabs: () => void;
    
    getActiveTab: () => TabData | null;
}

// ========================================
// Zustand 스토어 설정
// ========================================

export const useTabsStore = create<TabsState>()(
    persist(
        (set, get) => {
            let initialTabs: TabData[] = [];
            
            // IndexedDB 로부터 탭 복원 ( SSR 방지 )
            if (typeof window !== 'undefined') {
                try {
                    // localStorage 는 SQL 커밋문만 보존하고 data(쿼리 결과) 는 IndexedDB 에서 복원
                    const stored = localStorage.getItem('sql-tabs-storage');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed.tabs)) {
                            initialTabs = parsed.tabs.map((t: any) => ({
                                ...t,
                                cmdType: t.cmdType === 'execute' ? COMMAND_TYPE.EXECUTE : 
                                        t.cmdType === 'procedure' ? COMMAND_TYPE.PROCEDURE : 
                                        COMMAND_TYPE.SELECT,
                                // data 필드는 IndexedDB 에서 복원 (초기 null)
                                data: undefined,
                            }));
                        }
                    }
                } catch (e) {
                    console.warn('localStorage 복원 실패:', e);
                    initialTabs = [];
                }
            }
            
            if (initialTabs.length === 0) {
                initialTabs = [createDefaultTab(DEFAULT_TAB_ID)];
            } else {
                // 기존 탭 복원 - data 필드는 IndexedDB 에서 비동기로 복원
                console.log(`저장된 탭 ${initialTabs.length}개 발견, IndexedDB 에서 데이터 복원 중...`);
                
                // 각 탭의 쿼리 결과를 백그라운드에서 복원
                initialTabs.forEach(async (tab) => {
                    const cachedData = await restoreQueryResult(tab.id);
                    
                    if (cachedData) {
                        updateTabInternal(tab.id, { data: cachedData });
                        console.log(`탭 [${tab.name}] 쿼리 결과 복원 완료 (${cachedData.rows?.length || 0}행)`);
                    } else {
                        console.log(`탭 [${tab.name}] 에 저장된 결과가 없습니다`);
                    }
                });
                
                const defaultIndex = initialTabs.findIndex((t: TabData) => t.id === DEFAULT_TAB_ID);
                if (defaultIndex !== -1 && defaultIndex !== 0) {
                    const [defaultTab, ...rest] = initialTabs;
                    initialTabs = [defaultTab, ...rest];
                } else if (defaultIndex === -1) {
                    initialTabs.unshift(createDefaultTab(DEFAULT_TAB_ID));
                }
            }

            const activeId = initialTabs[0]?.id ?? DEFAULT_TAB_ID;

            return {
                tabs: initialTabs,
                activeTabId: activeId,
                
                addTab: () => {
                    set((state) => {
                        const activeData = state.tabs.find(tabData => tabData.id === state.activeTabId);

                        console.log('새 탭 생성 전 활성 탭 데이터:', activeData);
                        
                        const newTab = createDefaultTab();  // 항상 기본값 생성
                        
                        console.log('새로 생성된 탭:', newTab);
                        
                        return {
                            tabs: [...state.tabs, newTab],
                            activeTabId: newTab.id,
                        };
                    });
                },

                closeTab: (id: string) => {
                    set((state) => {
                        const curTab = state.tabs.find((t: TabData) => t.id === id);
                        if(curTab?.sql !== '') {
                            const isConfirmed = window.confirm("정말로 삭제하시겠습니까?");

                            if(!isConfirmed) return state;
                        }

                        if (id === DEFAULT_TAB_ID) return state;
                        
                        const tabIndex = state.tabs.findIndex(t => t.id === id);
                        if (tabIndex === -1) return state;

                        // IndexedDB 에서 해당 탭의 쿼리 결과 삭제
                        if (typeof window !== 'undefined') {
                            void clearQueryResult(id);
                        }

                        const newTabs = state.tabs.filter((t: TabData) => t.id !== id);
                        
                        if (newTabs.length === 0) {
                            return { tabs: [createDefaultTab(DEFAULT_TAB_ID)], activeTabId: DEFAULT_TAB_ID };
                        }

                        let newActiveId = state.activeTabId;
                        if (state.activeTabId === id) {
                            const newIndex = Math.max(0, tabIndex - 1);
                            newActiveId = newTabs[newIndex]?.id ?? null;
                        }

                        return { tabs: newTabs, activeTabId: newActiveId };
                    });
                },

                setActiveTab: (id: string) => {
                    set(() => ({ activeTabId: id }));
                },

                switchTab: (direction: 'left' | 'right') => {
                    const currentState = get();
                    const currentIndex = currentState.tabs.findIndex(t => t.id === currentState.activeTabId);
                    
                    if (currentIndex === -1) return;
                    
                    let newIndex: number;
                    if (direction === 'left') {
                        // Alt + 왼쪽 화살표: 이전 탭으로 이동
                        newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
                    } else {
                        // Alt + 오른쪽 화살표: 다음 탭으로 이동
                        newIndex = currentIndex < currentState.tabs.length - 1 ? currentIndex + 1 : currentIndex;
                    }
                    
                    if (newIndex !== currentIndex) {
                        const newTabId = currentState.tabs[newIndex].id;
                        set(() => ({ activeTabId: newTabId }));
                    }
                },

                updateTab: (id: string, updates: Partial<TabData>) => {
                    // 전체 데이터를 메모리에 유지 (IndexedDB 가 대용량 백업)
                    const filteredUpdates = { ...updates };
                    
                    // data 가 업데이트되면 lastUpdated 타임스탬프도 갱신
                    if ('data' in filteredUpdates && filteredUpdates.data !== undefined) {
                        filteredUpdates.lastUpdated = Date.now();
                        
                        const row_count = filteredUpdates.data.rows?.length || 0;
                        
                        console.log('데이터 크기:', row_count, '건');

                        // rows 는 항상 전체 저장 (UI 에 즉시 표시)
                        // total_count 만 기록
                        if (row_count > 200) {
                            console.log(`대용량 (${row_count}건), UI 에 전체 표시`);
                        }
                        // 51-200 행도 그대로 유지
                    }

                    // 전체 데이터를 메모리 상태에 저장 (IndexedDB 가 대용량 처리)
                    set((state) => ({
                        tabs: state.tabs.map(tab => 
                            tab.id === id ? { ...tab, ...filteredUpdates } : tab
                        ),
                        activeTabId: state.activeTabId,
                    }));

                    // data 변경 시 IndexedDB 에 비동기로 저장 (대용량 처리 최적화)
                    if (updates.data && typeof window !== 'undefined') {
                        void syncToIndexedDB(id, updates);
                    }
                },

                clearAllTabs: () => {
                    const defaultTab = createDefaultTab(DEFAULT_TAB_ID);
                    set(() => ({ tabs: [defaultTab], activeTabId: defaultTab.id }));
                },

                getActiveTab: () => {
                    const state = get();
                    return (state.activeTabId && 
                           state.tabs?.find(tab => tab.id === state.activeTabId)) || null;
                },
            };
        },
        {
            name: 'sql-tabs-storage',
            partialize: (state) => ({
                tabs: state.tabs.map((tab) => ({
                    id: tab.id,
                    name: tab.name,
                    sql: tab.sql,
                    cmdType: tab.cmdType,
                    scrollPos: tab.scrollPos,
                    cursorPosition: tab.cursorPosition,
                    executeAll: tab.executeAll,
                    result: tab.result,
                    // data 는 항상 전체 저장 (rows 포함)
                    data: tab.data ?? null,
                    isError: tab.isError,
                    errorMessage: tab.errorMessage,
                    createdAt: tab.createdAt,
                })),
                activeTabId: state.activeTabId,
            }),
        }
    )
);

// ============================================
// IndexedDB 동기화 헬퍼 함수들 (스토어 밖에서 정의)
// ============================================

/**
 * 탭 내부 업데이트 (setState 없이 상태 변경)
 */
function updateTabInternal(id: string, updates: Partial<TabData>) {
    useTabsStore.setState((state) => {
        if (!Array.isArray(state.tabs)) return state;
        
        const newTabs = state.tabs.map(tab => 
            tab.id === id ? { ...tab, ...updates } : tab
        );
        
        return { tabs: newTabs };
    });
}

/**
 * data 변경 시 IndexedDB 에 비동기로 저장 (대용량 처리 최적화)
 */
async function syncToIndexedDB(id: string, updates: Partial<TabData>) {
    if (!updates.data || typeof window === 'undefined') return;
    
    try {
        const currentState = useTabsStore.getState();
        const tab = currentState.tabs?.find(t => t.id === id);
        
        if (!tab) return;

        // data 는 50 행 이상이면 localStorage 에서 이미 필터링됨 (rows 가 []) 
        // 실제 전체 데이터는 IndexedDB 에 저장
        await saveQueryResult(id, updates.data);
        
        const displayRowCount = updates.data.rows?.length || tab.data?.total_count || 0;
        console.log(`IndexedDB 동기화 완료: [${tab.name}]`, displayRowCount, '행');

    } catch (error) {
        console.error('IndexedDB 동기화 실패:', error);
    }
}

// 초기化 시 오래된 데이터 정리 (30 일 기준)
// if (typeof window !== 'undefined') {
//     void clearExpiredData(30).then(() => {
//         console.log('오래된 캐시 정리 완료');
//     });
// }
