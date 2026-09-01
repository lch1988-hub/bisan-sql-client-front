'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { useTabsStore } from '@/stores/tabsStore';

interface RunAllToggleProps {
    activeTabId?: string;
}

/**
 * 전체 실행 체크박스 컴포넌트
 */
export const RunAllToggle: React.FC<RunAllToggleProps> = ({ activeTabId }) => {
    const { register, watch } = useFormContext();
    const updateTab = useTabsStore((state) => state.updateTab);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log(' [Checkbox Change] 전체실행 변경:', e.target.checked);
        
        if (activeTabId) {
            updateTab(activeTabId, { executeAll: e.target.checked });
            console.log('|  store 업데이트 완료:', { tabId: activeTabId, newExecuteAll: e.target.checked });
            
            setTimeout(() => {
                const currentState = useTabsStore.getState();
                const currentTab = currentState.tabs.find(t => t.id === activeTabId);
                console.log('| 저장된 상태 확인:', { 
                    tabId: activeTabId, 
                    storeExecuteAll: currentTab?.executeAll, 
                    sameAsInput: currentTab?.executeAll === e.target.checked 
                });
            }, 50);
        }
    };

    return (
        <div className="flex items-center gap-2 ml-5 pl-5 border-l-2 border-slate-200 dark:border-slate-600">
            <input 
                type="checkbox" 
                id="runAllQueries" 
                {...register('runAllQueries', { onChange: handleChange })} 
                className="w-[18px] h-[18px] accent-indigo-600 cursor-pointer" 
            />
            <label htmlFor="runAllQueries" className="text-sm font-medium select-none text-slate-500 dark:text-slate-400">
                전체 실행
            </label>
        </div>
    );
};
