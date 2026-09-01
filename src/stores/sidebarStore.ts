import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ========================================
// Sidebar State Interfaces
// ========================================

export interface SidebarState {
  isCollapsed: boolean;
  width: number; // Current width in pixels (default: 320px)
  isResizing: boolean; // Dragging state
  
  // Actions
  toggleSidebar: () => void;
  setWidth: (width: number) => void;
  startResize: () => void;
  stopResize: () => void;
}

// ========================================
// Zustand Store Configuration
// ========================================

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      width: 320, // Default: 320px (~18% at 1920px viewport)
      isResizing: false,

      toggleSidebar: () => {
        set((state) => ({ 
          isCollapsed: !state.isCollapsed,
          isResizing: false // Stop resize if toggling during drag
        }));
      },

      setWidth: (width) => {
        set({ width });
      },

      startResize: () => {
        set({ isResizing: true });
      },

      stopResize: () => {
        set({ isResizing: false });
      },
    }),
    {
      name: 'sidebar-state-storage', // localStorage key
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        width: state.width,
      } as SidebarState),
    }
  )
);
