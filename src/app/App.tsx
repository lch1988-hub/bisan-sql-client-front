'use client';

import React, { useState, useEffect } from 'react';
import { TabBar } from '@/components/TabBar';
import { useTabsStore } from '@/stores/tabsStore';
import { ThemeStatus } from '@/components/ThemeStatus';
import { ActiveEditor } from "@/components/ActiveEditor";
import { ResizableSidebar } from '@/components/layout/ResizableSidebar';
import { MetadataSidebar } from '@/components/MetadataSidebar';
import { ResizableBottomPanel } from '@/components/layout/ResizableBottomPanel';
import { useBottomPanelStore, useInitializePanelHeight } from '@/stores/bottomPanelStore';
import { ResultDisplay } from '@/components/ActiveEditor/ResultDisplay';
import { useTabDataLoader } from '@/hooks/useTabDataLoader';

export default function App() {
    const activeTab = useTabsStore((state) => state.getActiveTab());
    const panelHeight = useBottomPanelStore((state) => state.height);

    // localStorage 에서 저장된 높이 복원 (클라이언트 마운트 시 한 번만 실행)
    useInitializePanelHeight();

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors duration-300 overflow-hidden">
            {/* Debug: 배경색 시각화 */}
            <ThemeStatus />

            <div className="sticky top-0 z-40 bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 transition-colors duration-300 h-16 flex-shrink-0">
                <TabBar />
            </div>

            {/* 최상위: 위쪽 영역 (Sidebar + Editor) 과 하단 패널로 분리 */}
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* 상단 영역: 사이드바 + 에디터 가로 배치 - 하단 패널 높이를 제외한 나머지 공간 차지 */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left Sidebar - 하단 패널 제외된 높이만 차지 */}
                    <ResizableSidebar>
                        <MetadataSidebar />
                    </ResizableSidebar>

                    {/* Main Editor Area - 사이드바로 가려지지 않고 가로/세로 꽉차게 확장 */}
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        <ActiveEditor key={activeTab?.id || 'none'} />
                    </div>
                </div>
                
                {/* Bottom Results Panel - 하단에 고정, 사이드바로 가려지지 않음 */}
                {activeTab && (
                    <ResizableBottomPanel>
                        <ResultDisplayWithProgress
                            activeTabId={activeTab.id}
                            panelHeight={panelHeight}
                        />
                    </ResizableBottomPanel>
                )}
            </div>
        </div>
    );
}

interface ResultDisplayWithProgressProps {
    activeTabId: string;
    panelHeight?: number;
}

const ResultDisplayWithProgress: React.FC<ResultDisplayWithProgressProps> = ({ activeTabId, panelHeight }) => {
    const [hasMounted, setHasMounted] = useState(false);
    
    const activeTabRaw = useTabsStore((state) => state.tabs.find(t => t.id === activeTabId));

    useEffect(() => {
        setHasMounted(true);
    }, []);

    const activeTab = hasMounted ? activeTabRaw : null;
    
    const { fullDataLoading, loadedFullData } = useTabDataLoader(
        activeTabId,
        activeTab?.data ?? null,
        activeTab?.lastUpdated
    );

    if (!hasMounted) return <div className="p-5 text-center"><p className="text-gray-500 dark:text-slate-400">로딩 중...</p></div>;

    return (
        <>
            {/* Progress bar: query execution or IndexedDB loading */}
            {(fullDataLoading || activeTab?.isExecuting) && (
                <div className="w-full bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 h-1.5 relative overflow-hidden">
                    {/* Animated shimmer effect */}
                    <div className="absolute inset-0 bg-indigo-600 dark:bg-indigo-500 animate-progress" />
                </div>
            )}

            {activeTab && (
                <ResultDisplay 
                    hasMounted={hasMounted}
                    activeTab={activeTab}
                    fullDataLoading={fullDataLoading}
                    loadedFullData={loadedFullData}
                    panelHeight={panelHeight}
                />
            )}
        </>
    );
};
