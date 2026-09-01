import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect } from 'react';

// ========================================
// Bottom Panel State Interfaces
// ========================================

export interface BottomPanelState {
  isCollapsed: boolean; // Show/hide state
  height: number; // Current height in pixels
  isResizing: boolean; // Dragging state
  
  // Actions
  togglePanel: () => void;
  setHeight: (height: number) => void;
  startResize: () => void;
  stopResize: () => void;
}

// ========================================
// Zustand Store Configuration
// ========================================

export const useBottomPanelStore = create<BottomPanelState>()(
  persist(
    (set) => ({
      // SSR & client 초기값: 300px(화면의 약 1/6)
      isCollapsed: false,
      height: 300, 
      isResizing: false,

      togglePanel: () => {
        set((state) => ({ 
          isCollapsed: !state.isCollapsed,
          isResizing: false
        }));
      },

      setHeight: (height: number) => {
        set({ height });
      },

      startResize: () => {
        set({ isResizing: true });
      },

      stopResize: () => {
        set({ isResizing: false });
      },
    }),
    {
      name: 'bottom-panel-state-storage', // localStorage key
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        height: state.height,
      })
    }
  )
);

// 클라이언트에서 localStorage 저장된 값을 먼저 적용하기 위한 hook
export function useInitializePanelHeight() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('bottom-panel-state-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        const savedState = parsed?.state;
        
        if (savedState && typeof savedState.height === 'number') {
          console.log(`[BottomPanel] 저장된 높이 (${savedState.height}px) 복원`);
          useBottomPanelStore.getState().setHeight(savedState.height);
          return; // 저장된 값 있으면 사용 중지
        }
      }
    } catch (e) {
      console.error('[BottomPanel] localStorage 복원 실패:', e);
    }
    
    // 저장된 값 없으면 300px 사용 (화면이 매우 크지 않다면 약 1/6)
    const newHeight = typeof window !== 'undefined' ? Math.max(300, Math.min(window.innerHeight * 0.5, 600)) : 300;
    useBottomPanelStore.getState().setHeight(newHeight);
  }, []);
}
