'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useSidebarStore } from '@/stores/sidebarStore';

interface ResizableSidebarProps {
  children: React.ReactNode;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({ children }) => {
  const { isCollapsed, width: storeWidth, isResizing, toggleSidebar, startResize, stopResize, setWidth } = useSidebarStore();
  
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  // 임시 너비: 드래그 중만 사용 (로컬 상태)
  const [tempWidth, setTempWidth] = useState<number | null>(null);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    
    if (sidebarRef.current) {
      startWidth.current = sidebarRef.current.offsetWidth;
    }
    
    startResize();
  }, [startResize]);

  // Mouse move handler for resize - 드래그 중에는 store 업데이트 없이 로컬 상태만 변경 (성능 최적화)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    
    const deltaX = e.clientX - startX.current;
    const newWidth = Math.max(200, startWidth.current + deltaX); // Minimum 200px
    
    // store 업데이트 대신 로컬 상태만 변경
    setTempWidth(newWidth);
  }, []);

  // Mouse up handler to stop resize - final 높이 한 번만 store 에 저장
  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      
      // 최종 너비를 store 에 저장 (localStorage 반영)
      if (tempWidth !== null && sidebarRef.current) {
        setWidth(tempWidth);
      }
      
      // 로컬 상태 초기화
      setTempWidth(null);
      stopResize();
    }
  }, [tempWidth, setWidth, stopResize, sidebarRef]);

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
        className="relative overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: 50 }} // Minimal space for toggle button
      >
        {/* Toggle Button - Show when collapsed */}
        <button
          onClick={toggleSidebar}
          className="absolute left-full top-1/2 -translate-y-1/2 translate-x-1 z-50 w-6 h-12 bg-white dark:bg-slate-700 border-l-2 border-r-2 border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-md flex items-center justify-center group"
        >
          <svg 
            className="w-4 h-4 text-slate-600 dark:text-slate-300 transform rotate-180 transition-transform duration-300 group-hover:scale-125" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Sidebar Content */}
      <div 
        ref={sidebarRef}
        className={`h-full relative transition-all duration-300 ease-in-out overflow-hidden ${isResizing ? 'cursor-col-resize' : ''}`}
        style={{ 
          width: `${tempWidth ?? storeWidth}px`,
          flexShrink: 0,
          willChange: isResizing ? undefined : 'width',
        }}
      >
        {children}
        
        {/* Resize Handle */}
        <button
          onMouseDown={handleMouseDown}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-30"
          title="드래그하여 크기 조절"
        />

        {/* Toggle Button - Hide when expanded */}
        <button
          onClick={toggleSidebar}
          className="absolute right-full top-1/2 -translate-y-1/2 -translate-x-4 w-6 h-10 bg-white dark:bg-slate-700 border-r-2 border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-md flex items-center justify-center group z-50"
        >
          <svg 
            className="w-4 h-4 text-slate-600 dark:text-slate-300 transition-transform duration-300 group-hover:scale-125" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </>
  );
};
