'use client';

import React, { useEffect } from 'react';
import { useTabsStore } from '@/stores/tabsStore';
import { TabItem } from './TabItem';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId } = useTabsStore();
    const addTab = useTabsStore((state) => state.addTab);
    const switchTab = useTabsStore((state) => state.switchTab);

    // Alt+Arrow 키로 탭 전환 (이전/다음 탭)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    
                    // 탭 전환만 수행, focus 는 ActiveEditor 에서 자동으로 처리
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

    return (
        <div className="flex items-center bg-slate-800 border-b-2 border-slate-900 px-0 pt-2.5 overflow-x-auto whitespace-nowrap">
            <div className="flex gap-[2px] mr-5">
                {tabs.map((tab) => (
                    <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
                ))}
                
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
