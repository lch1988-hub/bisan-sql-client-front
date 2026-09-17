'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { COMMAND_TYPE, type CommandTypeValue } from '@/constants/commandTypes';
import { useTabsStore } from '@/stores/tabsStore';

interface CommandTypeSelectorProps {
    activeTabId?: string;
}

/**
 * SQL 명령어 타입 선택 (SELECT / EXECUTE / PROCEDURE) 라디오 버튼 컴포넌트
 */
export const CommandTypeSelector: React.FC<CommandTypeSelectorProps> = ({ activeTabId }) => {
    const { register } = useFormContext();
    const updateTab = useTabsStore((state) => state.updateTab);

    const handleCmdTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (activeTabId) {
            updateTab(activeTabId, { cmdType: e.target.value as CommandTypeValue });
        }
    };

    const labelMap: Record<string, string> = {
        [COMMAND_TYPE.SELECT]: '조회 (SELECT)',
        [COMMAND_TYPE.EXECUTE]: '실행 (INSERT/UPDATE/DELETE)',
        [COMMAND_TYPE.PROCEDURE]: 'PROCEDURE'
    };

    return (
        <div className="flex gap-[24px]">
            {Object.entries(COMMAND_TYPE).map(([key, value], idx) => {
                const marginRight = (idx === 0 || idx === 2) ? '64px' : 0;
                
                return (
                    <label 
                        key={value} 
                        className="text-base font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300" 
                        style={{ marginRight }}
                    >
                        <input 
                            type="radio" 
                            value={value} 
                            {...register('cmdType', { onChange: handleCmdTypeChange })} 
                            className="accent-indigo-600 mr-2"
                        />
                        {labelMap[key] || key}
                    </label>
                );
            })}
        </div>
    );
};
