'use client';

import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';

/**
 * 페이지네이션 입력 필드 컴포넌트 (FROM ~ TO)
 */
export const PaginationInput: React.FC = () => {
    const { control } = useFormContext();

    return (
        <div className="flex items-center gap-3 ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-600">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 select-none">페이지:</span>
            
            <Controller 
                name="fromPos" 
                control={control} 
                render={({field, fieldState}) => (
                    <>
                        <input 
                            type="number" 
                            min="0" 
                            max="1000" 
                            step="1"
                            className="w-20 px-2 py-1 border-2 border-slate-200 dark:border-slate-600 rounded text-center text-sm focus:border-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" 
                            {...field} 
                        />
                        {fieldState.error && (
                            <span className="text-xs text-red-500">{fieldState.error.message}</span>
                        )}
                    </>
                )} 
            />
            
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500"> ~ </span>
            
            <Controller 
                name="toPos" 
                control={control} 
                render={({field: {onChange, value}, fieldState}) => (
                    <>
                        <input 
                            type="number" 
                            min="0" 
                            max="100" 
                            step="1"
                            className="w-20 px-2 py-1 border-2 border-slate-200 dark:border-slate-600 rounded text-center text-sm focus:border-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                            value={value ?? ''} 
                            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} 
                        />
                        {fieldState.error && (
                            <span className="text-xs text-red-500">{fieldState.error.message}</span>
                        )}
                    </>
                )} 
            />
            
            <span className="text-xs text-slate-400 dark:text-slate-500">(기본: 0~10)</span>
        </div>
    );
};
