'use client';

import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback } from 'react';
import type { FormValues, ApiResponse } from '@/schemas/formSchema';
import { COMMAND_TYPE } from '@/constants/commandTypes';
import { useTabsStore } from '@/stores/tabsStore';
import { getApiUrl } from '@/lib/api';

/**
 * SQL 쿼리 실행을 위한 custom hook
 * ActiveEditor 와 ExecuteButton 에서 공통적으로 사용
 */
export function useQueryExecution(activeTabId?: string) {
  const updateTab = useTabsStore((state) => state.updateTab);

  // mutation 함수 생성
  const mutation = useMutation({
    mutationFn: async (payload: FormValues) => {
      try {
        const response = await axios.post<ApiResponse>(getApiUrl('/api/process'), payload);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return error.response?.data || { success: false, result: 'Network error' };
        }
        throw new Error('Unknown error');
      }
    },
    onSuccess: (data: ApiResponse) => {
      if (activeTabId) {
        updateTab(activeTabId, {
          data: data.data,
          result: data.result,
          isError: !data.success,
          errorMessage: data.message
        });
      }
    },
    onError: (error) => {
      if (activeTabId) {
        updateTab(activeTabId, {
          isError: true,
          errorMessage: error.message || '알 수 없는 오류가 발생했습니다.'
        });
      }
    }
  });

  // SQL 실행을 위한 콜백 함수
  const executeQuery = useCallback((sqlToExecute: string, cmdTypeVal: FormValues['cmdType'], fromPos: number, toPos: number) => {
    let finalSql = sqlToExecute;
    const runAll = useTabsStore.getState().getActiveTab()?.executeAll || false;

    if (cmdTypeVal === COMMAND_TYPE.PROCEDURE) {
      // PROCEDURE 는 그대로 실행
      finalSql = sqlToExecute;
    } else if (runAll) {
      // 전체 실행 모드: 모든 쿼리를 하나의 문자로 처리
      finalSql = sqlToExecute.replace(/\n/g, ' ').replace(/;/g, '{{{+}}} ');
    } else {
      // 단일 쿼리 모드
      finalSql = sqlToExecute.trim().replace(/;\s*$/, '');
    }

    const payload: FormValues = {
      sql: finalSql,
      cmdType: cmdTypeVal === COMMAND_TYPE.PROCEDURE ? COMMAND_TYPE.EXECUTE : cmdTypeVal,
      runAllQueries: false,
      fromPos: fromPos,
      toPos: toPos,
    };

    mutation.mutate(payload);
  }, [mutation]);

  return {
    mutation,
    executeQuery,
    isExecuting: mutation.isPending,
  };
}
