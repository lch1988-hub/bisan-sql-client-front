'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { COMMAND_TYPE, type CommandTypeValue } from '@/constants/commandTypes';
import { useTabsStore } from '@/stores/tabsStore';
import { extractCurrentQuery } from '@/utils/sqlUtils';
import { useQueryExecution } from '@/hooks/useQueryExecution';

interface ExecuteButtonProps {
    activeTabId?: string;
}

/**
 * SQL 실행 버튼 컴포넌트
 * useQueryExecution hook 을 사용하여 중복 로직 제거
 */
export const ExecuteButton: React.FC<ExecuteButtonProps> = ({ 
    activeTabId 
}) => {
    const { getValues, watch } = useFormContext();
    
    // SQL 실행 hook 사용
    const { mutation } = useQueryExecution(activeTabId);

    const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        
        console.log('[ExecuteButton] 클릭됨');
        
        const formSql = getValues().sql;
        const tabSql = activeTabId ? useTabsStore.getState().getActiveTab()?.sql : '';
        const currentSql = formSql || tabSql;
        
        console.log('[ExecuteButton] SQL 값:', { 
            formSql: formSql?.substring(0, 50), 
            tabSql: tabSql?.substring(0, 50),
            finalSql: currentSql?.substring(0, 100)
        });
        
        if (!currentSql || currentSql.trim() === '') {
            alert('SQL 쿼리를 입력해주세요!');
            return;
        }
        
        // 전체 SQL 을 실행 (버튼 클릭 시에는 전체 실행)
        const safeCmdType = watch('cmdType') as CommandTypeValue || COMMAND_TYPE.SELECT;
        
        console.log('[ExecuteButton] 실행:', { 
            cmdType: safeCmdType, 
            sqlLength: currentSql.length 
        });

        mutation.mutate({
            sql: currentSql,
            cmdType: safeCmdType === COMMAND_TYPE.PROCEDURE ? COMMAND_TYPE.EXECUTE : safeCmdType,
            runAllQueries: false,
            fromPos: 0,
            toPos: 1,
        });
        
        console.log('[ExecuteButton] mutation 호출 완료');
    };

    return (
        <button
            type="submit"
            disabled={mutation.isPending}
            onClick={handleSubmit}
            className={`text-white bg-indigo-600 border-none rounded-lg px-10 py-4 text-xl ${
                mutation.isPending ? 'opacity-70 cursor-not-allowed' : ''
            }`}
        >
            {mutation.isPending ? (
                <div className="flex items-center justify-center gap-3">
                    <svg 
                        className="animate-spin h-5 w-5 text-white" 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24"
                    >
                        <circle 
                            className="opacity-25" 
                            cx="12" 
                            cy="12" 
                            r="10" 
                            stroke="currentColor" 
                            strokeWidth="4"
                        />
                        <path 
                            className="opacity-75" 
                            fill="currentColor" 
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                    </svg>
                    <span>처리 중...</span>
                </div>
            ) : (
                '실행'
            )}
        </button>
    );
};