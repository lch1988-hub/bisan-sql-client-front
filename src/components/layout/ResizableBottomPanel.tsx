'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useBottomPanelStore, useInitializePanelHeight } from '@/stores/bottomPanelStore';

interface ResizableBottomPanelProps {
  children: React.ReactNode;
}

export const ResizableBottomPanel: React.FC<ResizableBottomPanelProps> = ({ children }) => {
  // localStorage 에서 저장된 값 복원 또는 화면 높이에 맞는 초기화
  useInitializePanelHeight();
  
  const { isCollapsed, height: storeHeight, isResizing, togglePanel, startResize, stopResize, setHeight } = useBottomPanelStore();
  
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  // 임시 높이: 드래그 중만 사용 (로컬 상태)
  const [tempHeight, setTempHeight] = useState<number | null>(null);

  // Handle resize - mouse down on drag handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    
    if (panelRef.current) {
      startHeight.current = panelRef.current.offsetHeight;
    }
    
    startResize();
  }, [startResize]);

  // Mouse move handler for resize - drag from top edge, no height limit
  // 드래그 중에는 store 업데이트 없이 로컬 상태만 변경 (성능 최적화)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !panelRef.current) return;
    
    const deltaY = startY.current - e.clientY; // Positive when dragging up (increasing height)
    let newHeight = startHeight.current + deltaY;
    
    // Minimum 100px only, no maximum limit
    newHeight = Math.max(100, newHeight);
    
    // store 업데이트 대신 로컬 상태만 변경
    setTempHeight(newHeight);
  }, []);

  // Mouse up handler to stop resize - final 높이 한 번만 store 에 저장
  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      
      // 최종 높이를 store 에 저장 (localStorage 반영)
      if (tempHeight !== null && panelRef.current) {
        setHeight(tempHeight);
      }
      
      // 로컬 상태 초기화
      setTempHeight(null);
      stopResize();
    }
  }, [tempHeight, setHeight, stopResize, panelRef]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  if (isCollapsed) {
    return (
      <div 
        className="relative transition-all duration-300 ease-in-out flex-shrink-0"
        style={{ height: 0 }}
      >
        {/* Toggle Button - Show when collapsed (at bottom edge) */}
        <button
          onClick={togglePanel}
          className="absolute left-1/2 -translate-x-1/2 -top-8 z-50 w-24 h-10 bg-white dark:bg-slate-700 border-t-2 border-x-2 border-slate-300 dark:border-slate-600 rounded-t-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-md flex items-center justify-center group"
          title="결과창 보이기 (현재: 숨김)"
        >
          <svg 
            className="w-5 h-5 text-slate-600 dark:text-slate-300 transform transition-transform duration-300 group-hover:rotate-180" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Panel Content - z-index 60 for above sidebar */}
      <div 
        ref={panelRef}
        className={`relative transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${isResizing ? 'cursor-row-resize' : ''}`}
        style={{ 
          height: `${tempHeight ?? storeHeight}px`,
          willChange: isResizing ? undefined : 'height',
          zIndex: 60, // 사이드바 (z-50) 보다 위에 표시
        }}
      >
        {/* Resize Handle - at top edge, expanded for easier grabbing */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 right-0 top-0 h-6 cursor-row-resize hover:bg-blue-500/20 active:bg-blue-600/30 transition-colors z-40 flex items-center justify-center"
          title="드래그하여 크기 조절"
        >
          <div className="w-full max-w-xs h-1 bg-slate-400 dark:bg-slate-500 rounded-full mx-auto shadow-sm" />
        </div>

        {/* Content */}
        <div className="absolute inset-0 top-6 overflow-auto">
          {children}
        </div>

        {/* Toggle Button - Hide when expanded (at bottom edge) */}
        <button
          onClick={togglePanel}
          className="absolute left-1/2 bottom-2 -translate-x-1/2 z-50 w-8 h-8 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-md flex items-center justify-center group"
          title="결과창 숨기기"
        >
          <svg 
            className="w-4 h-4 text-slate-600 dark:text-slate-300 transition-transform duration-300 group-hover:rotate-180" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Resize info tooltip during drag */}
        {isResizing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-800 dark:bg-slate-700 text-white px-3 py-1 rounded-full text-sm font-medium shadow-lg">
            {Math.round(tempHeight ?? storeHeight)}px
          </div>
        )}
      </div>
    </>
  );
};
