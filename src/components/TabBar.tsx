'use client';

import React, { useEffect, useState } from 'react';
import { useTabsStore } from '@/stores/tabsStore';
import { TabItem } from './TabItem';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId } = useTabsStore();
    const addTab = useTabsStore((state) => state.addTab);
    const switchTab = useTabsStore((state) => state.switchTab);
    const setActiveTab = useTabsStore((state) => state.setActiveTab);
    const reorderTabs = useTabsStore((state) => state.reorderTabs);

    // 드래그 중인 탭 ID 추적
    const [activeId, setActiveId] = useState<string | null>(null);

    // Alt+Arrow 키로 탭 전환 (이전/다음 탭)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    switchTab(e.key === 'ArrowLeft' ? 'left' : 'right');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [switchTab]);

    const handleAddTab = () => {
        addTab();
    };

    // DragStart 핸들러 - 드래그 시작 시 activeId 저장
    const handleDragStart = (event: any) => {
        setActiveId(String(event.active.id));
    };

    // DragEnd 핸들러
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null); // 드래그 종료 시 activeId 초기화

        if (!over || active.id === over.id) return;

        const oldIndex = tabs.findIndex((t) => t.id === active.id);
        const newIndex = tabs.findIndex((t) => t.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        // 첫 번째 탭은 고정 (움직일 수 없음)
        if (tabs[oldIndex]?.id === tabs[0]?.id || tabs[newIndex]?.id === tabs[0]?.id) return;

        reorderTabs(oldIndex, newIndex);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { 
                delay: 100,    // 드래그 시작 전 100ms 딜레이 (click 이 먼저 발생)
                tolerance: 5,  // 5px 이내 이동은 클릭으로 처리
                distance: 0,   // distance 는 무시
            },
        })
    );

    // SSR 안전화 - 마운팅 완료 후 DndContext 활성화
    const [hasMounted, setHasMounted] = useState(false);
    
    useEffect(() => {
        setHasMounted(true);
    }, []);

    return (
        <div className="flex items-center bg-slate-800 border-b-2 border-slate-900 px-0 pt-2.5 overflow-x-auto whitespace-nowrap">
            <div className="flex gap-[2px] mr-5">
                {hasMounted && (
                    <DndContext 
                        sensors={sensors} 
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex gap-[2px]">
                            {tabs.map((tab) => (
                                <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
                            ))}
                        </div>

                        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0.8, 1)' }}>
                            {activeId ? (
                                tabs.find((tab) => tab.id === activeId) && (
                                    <div className="opacity-90 scale-105 cursor-grabbing">
                                        {tabs.filter((tab) => tab.id === activeId).map((tab) => (
                                            <TabItem key={tab.id} tab={tab} isActive={false} />
                                        ))}
                                    </div>
                                )
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
                
                {hasMounted === false && (
                    // SSR 시에는 드래그 없이 그냥 렌더링
                    tabs.map((tab) => (
                        <div 
                            key={tab.id}
                            className="flex items-center px-4 py-2.5 rounded-t-lg cursor-pointer select-none bg-slate-700 text-slate-400 border-b-[3px] border-transparent"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
                                {tab.name || '새 SQL'}
                            </span>
                        </div>
                    ))
                )}
                
                <button
                    onClick={handleAddTab}
                    className="px-3.5 py-2 bg-indigo-600 text-white border-none rounded-lg cursor-pointer text-xl font-bold ml-2.5 transition-all duration-200 hover:bg-indigo-700 hover:-translate-y-0.5"
                    title="새 탭 추가"
                >
                    +
                </button>
            </div>

            {tabs.length >= 5 && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2 rotate-90 text-slate-600 text-[20px]">
                    -
                </div>
            )}
        </div>
    );
};

export const TabContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="flex-1 bg-slate-50">{children}</div>;
};

export default TabBar;
