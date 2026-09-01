import React from 'react';
import { useTabsStore, type TabData } from '@/stores/tabsStore';

interface TabItemProps {
    tab: TabData;
    isActive: boolean;
}

/**
 * 개별 탭 항목 컴포넌트
 */
export const TabItem: React.FC<TabItemProps> = ({ tab, isActive }) => {
    const setActiveTab = useTabsStore((state) => state.setActiveTab);
    const closeTab = useTabsStore((state) => state.closeTab);

    // 첫 번째 탭 (고정 탭) 확인
    const isFirstTab = tab.id === useTabsStore.getState().tabs[0]?.id;

    // 탭 클릭 시 활성화
    const handleClick = () => {
        setActiveTab(tab.id);
    };

    // 탭 닫기
    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        closeTab(tab.id);
    };

    return (
        <div
            className={`group flex items-center px-4 py-2.5 rounded-t-lg cursor-pointer select-none transition-all duration-200 border-b-[3px] ${
                isActive 
                    ? 'bg-slate-600 text-white border-indigo-600' 
                    : 'bg-slate-700 text-slate-400 border-transparent hover:bg-slate-650'
            }`}
            onClick={handleClick}
        >
            <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
                {tab.name || '새 SQL'}
            </span>
            
            {!isFirstTab && (
                <button
                    onClick={handleClose}
                    className={`ml-1.5 px-1 py-0 bg-transparent border-none rounded transition-all duration-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible ${
                        isActive 
                            ? 'text-white hover:text-red-400' 
                            : 'text-slate-400 hover:text-red-400'
                    } hover:bg-white/10 hover:scale-110`}
                    title="탭 닫기"
                >
                    ×
                </button>
            )}
        </div>
    );
};
