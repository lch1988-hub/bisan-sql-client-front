'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { extractCurrentQuery } from '@/utils/sqlUtils';
import { COMMAND_TYPE } from '@/constants/commandTypes';
import { useTabsStore } from '@/stores/tabsStore';
import {CommandTypeSelector} from './ActiveEditor/CommandTypeSelector';
import { RunAllToggle } from './ActiveEditor/RunAllToggle';
import { PaginationInput } from './ActiveEditor/PaginationInput';
import { ExecuteButton } from './ActiveEditor/ExecuteButton';
import SQLMonacoEditor from './editor/SQLMonacoEditor';
import { FormValues } from '@/schemas/formSchema';
import { formSchema} from '@/schemas/formSchema';

// Custom Hooks
import { useQueryExecution } from '@/hooks/useQueryExecution';
import { useMetadataSync } from '@/hooks/useMetadataSync';

export const ActiveEditor: React.FC = () => {
  // Hydration 문제 해결을 위한 state
  const [hasMounted, setHasMounted] = useState(false);
  
  const activeTabRaw = useTabsStore((state) => state.getActiveTab());
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const updateTab = useTabsStore((state) => state.updateTab);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // SSR 중에는 항상 일정한 기본값 사용 (hydration 일치 보장)
  const activeTab = hasMounted ? activeTabRaw : { 
      id: 'default-sql-tab', 
      sql: '', 
      cmdType: COMMAND_TYPE.SELECT, 
      isError: false, 
      errorMessage: undefined,
      result: null,
      data: undefined,
      executeAll: false,
      scrollPos: 0,
      cursorPosition: 0,
      lastUpdated: Date.now(),
      createdAt: Date.now(),
  };

  // 커서 위치 상태
  const [, setCursorPosition] = useState(0);
  
  // SQL 자동완성 및 저장 관련 state
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cursorSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserTypingRef = useRef(false);
  
  // **복원 중 플래그 (store 업데이트 방지)**
  const isRestoringRef = useRef(false);

  // Custom Hooks 사용 (hasMounted 체크 제거)
  const { executeQuery } = useQueryExecution(activeTabId ?? undefined);
  // 메타데이터 동기화는 useMetadataSync 훅이 단일 책임 (대문자 정규화 포함)
  useMetadataSync();

  // 탭 전환 시 form 상태 동기화
  useEffect(() => {
    if (!hasMounted || !activeTab?.id) return;

    const syncFormData = () => {
      // form 값 동기화
      if (activeTab.sql !== form.getValues('sql')) {
        form.setValue('sql', activeTab.sql || '', { shouldValidate: true, shouldDirty: true });
      }

      if (activeTab.cmdType && activeTab.cmdType !== form.getValues('cmdType')) {
        form.setValue('cmdType', activeTab.cmdType, { shouldValidate: true, shouldDirty: true });
      }

      if (activeTab.executeAll !== undefined && activeTab.executeAll !== form.getValues('runAllQueries')) {
        form.setValue('runAllQueries', activeTab.executeAll, { shouldValidate: true, shouldDirty: true });
      }
    };

    // 즉시 form 동기화 - store 의 최신 값 사용
    syncFormData();

  }, [hasMounted, activeTab?.id]);

  // 에디터에서 온 mount 완료 콜백 - store 를 직접 읽어서 최신 상태 사용
const handleEditorMountComplete = useCallback((editor: any) => {
  if (!editor || !editor.getModel()) return;

  const currentActiveTab = useTabsStore.getState().getActiveTab();
  if (currentActiveTab) restoreCursorPositionInEditor(editor, currentActiveTab);
}, []);

// 커서 복원을 별도의 함수로 분리 - 탭 전환 시점에서도 호출 가능하도록
const restoreCursorPositionInEditor = useCallback((editor: any, targetTab: {id: string, cursorPosition: number, sql?: string}) => {
  if (!editor || !editor.getModel()) return;

  // **복원 중 플래그 체크 (이중 차단)**
  if (isRestoringRef.current) {
    editor.focus();
    return;
  }

  // lock 체크 - 매우 빠르게 해제 (타이밍 충돌 방지)
  if (editor._restoringFlag) {
    editor.focus();
    return;
  }

  isRestoringRef.current = true;
  editor._restoringFlag = true;

  const savedCursorPos = targetTab.cursorPosition ?? 0;
  const sqlLength = (targetTab.sql || '').length;

  const monacoRef = window.monacoInstanceRef;
  if (!monacoRef?.editor) {
    editor._restoringFlag = false;
    editor.focus();
    return;
  }

  try {
    if (savedCursorPos > 0 && savedCursorPos <= sqlLength) {
      const position = monacoRef.editor.getModel().getPositionAt(savedCursorPos);
      monacoRef.editor.setPosition(position);
      monacoRef.editor.revealLineInCenter(position.lineNumber);
      monacoRef.editor.focus();
    } else {
      monacoRef.editor.setPosition({ lineNumber: 1, column: 1 });
      if (sqlLength > 0) {
        monacoRef.editor.revealLineInCenter(1);
      }
      monacoRef.editor.focus();
    }
  } catch (e) {
    try {
      monacoRef.editor.setPosition({ lineNumber: 1, column: 1 });
      monacoRef.editor.focus();
    } catch {
      console.error('Fallback failed:', e);
    }
  } finally {
    setTimeout(() => {
      editor._restoringFlag = false;
      isRestoringRef.current = false;
    }, 16);
  }
}, []);

// TabBar 에서 탭 전환 후 에디터 포커스를 줌 (복원 후 사용자 클릭 가능하게)
useEffect(() => {
    if (!hasMounted || !activeTab?.id) return;

    const timer = setTimeout(() => {
        const editor = window.monacoInstanceRef?.editor;

        if (!editor) return;

        // store 에서 최신 상태 확인 - 중복 복원 제거
        const latestTab = useTabsStore.getState().getActiveTab();

        // onMountComplete 에서 했으므로 여기선 skip
        // 단, onMountComplete 가 호출되지 않은 경우만을 대비해서 유지
        if (!editor._restoringFlag && !isRestoringRef.current) {
            // latestTab 이 null 이 아닌지 체크
            if (latestTab) {
                restoreCursorPositionInEditor(editor, latestTab);

                // 복원 완료 후 포커스 설정 (사용자가 인지할 시간을 줌)
                setTimeout(() => editor.focus(), 200);
            }
        }
    }, 50);

    return () => clearTimeout(timer);
}, [hasMounted, activeTab?.id]);


  // Form 초기화
const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
      defaultValues: {
          sql: activeTab?.sql || '',
          cmdType: activeTab?.cmdType || COMMAND_TYPE.SELECT,
          runAllQueries: activeTab?.executeAll || false,
          fromPos: 0,
          toPos: 1,
          scrollPos: 0,
      },
  });

  if (!activeTab) {
      return (
          <div className="flex-1 flex items-center justify-center">
              <h2>탭이 없습니다. 상단의 + 버튼을 눌러 새 탭을 추가하세요.</h2>
          </div>
      );
  }

  return (
      <div className="flex-1 flex flex-col" tabIndex={-1}>
          <FormProvider {...form}>
              <form
                  onSubmit={(e) => e.preventDefault()}
                  className="flex flex-col w-[95%] max-w-[1920px] mx-auto my-5 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-7 border border-slate-200 dark:border-slate-700 h-full min-h-0"
              >
                  {/* SQL 에디터 */}
                  <div className="flex-1 overflow-hidden" style={{position: 'relative'}}>
                      <Controller
                          name="sql"
                          control={form.control}
                          render={({field}) => (

                                <SQLMonacoEditor
                                    value={field.value || ''}
                                    onChange={(newValue) => {
                                        // React Hook Form 상태 업데이트
                                        field.onChange(newValue);

                                        isUserTypingRef.current = true;  // 입력 시작 플래그

                                        // debounce 처리하여 저장 (SQL + 커서 위치)
                                        if (saveTimeoutRef.current) {
                                          clearTimeout(saveTimeoutRef.current);
                                        }

                                        saveTimeoutRef.current = setTimeout(() => {
                                            const monacoRef = window.monacoInstanceRef;

                                            // 현재 SQL 과 커서 위치를 한 번에 저장
                                            if (activeTab?.id) {
                                                let currentCursorPos = 0;

                                                if (monacoRef?.editor) {
                                                    try {
                                                        const pos = monacoRef.editor.getPosition();
                                                        if (pos) {
                                                            const model = monacoRef.editor.getModel();
                                                            currentCursorPos = model.getOffsetAt(pos);
                                                            setCursorPosition(currentCursorPos);  // React state 도 동기화
                                                        }
                                                    } catch (e) {
                                                        console.warn('모나코 위치 읽기 실패:', e);
                                                    }
                                                }
                                                
                                                updateTab(activeTab.id, { 
                                                    sql: newValue || '',
                                                    cursorPosition: currentCursorPos
                                                });
                                            }
                                            
                                            isUserTypingRef.current = false;  // 입력 완료 - 이제 커서가동하면 즉시 저장 가능
                                        }, 50);
                                      }}
                                    onMountComplete={handleEditorMountComplete}
                                    onCursorChange={(offset) => {
                                        const currentTab = useTabsStore.getState().getActiveTab();
                                        
                                        if (!currentTab?.id) return;
                                        setCursorPosition(offset);
                                        
                                        // 클릭/커서 이동 시도 debounce 후 저장 (타이밍 충돌 방지)
                                        if (cursorSaveTimeoutRef.current) {
                                            clearTimeout(cursorSaveTimeoutRef.current);
                                        }
                                        
                                        cursorSaveTimeoutRef.current = setTimeout(() => {
                                            const latestTab = useTabsStore.getState().getActiveTab();
                                            
                                            if (!latestTab?.id) return;
                                            
                                            updateTab(latestTab.id, { 
                                                cursorPosition: offset
                                            });
                                        }, 20); // 매우 짧은 debounce (16ms 보다 짧음)
                                    }}
                                  onSubmit={(selectedText, selectionStart, selectionEnd) => {
                                      const cmdTypeValue = form.watch('cmdType');
                                      
                                      let sqlToExecute: string;
                                      if (selectedText) {
                                          sqlToExecute = selectedText;
                                      } else {
                                          const fullSql = form.getValues().sql || activeTab?.sql || '';
                                          
                                          if (!fullSql) {
                                              console.warn('실행할 SQL 이 없습니다');
                                              return;
                                          } else if (cmdTypeValue === COMMAND_TYPE.PROCEDURE) {
                                              sqlToExecute = fullSql;
                                          } else {
                                              const actualCursorPos = Math.min(selectionStart, fullSql.length);
                                              sqlToExecute = extractCurrentQuery(fullSql, actualCursorPos);
                                          }
                                      }
                                      
                                      const safeCmdType = cmdTypeValue && Object.values(COMMAND_TYPE).includes(cmdTypeValue) 
                                          ? cmdTypeValue 
                                          : COMMAND_TYPE.SELECT;

                                      executeQuery(
                                          sqlToExecute,
                                          safeCmdType,
                                          selectedText ? selectionStart : 0,
                                          selectedText ? selectionEnd : 0
                                      );
                                  }}
                              />
                          )}
                      />
                  </div>

                  {/* 컨트롤러 영역 */}
                  <div className="flex items-center justify-between border-t-2 border-slate-100 dark:border-slate-700 pt-7">
                      <div className="flex items-center">
                          <CommandTypeSelector activeTabId={activeTab.id} />

                          <RunAllToggle activeTabId={activeTab.id} />

                          {form.watch('cmdType') === COMMAND_TYPE.SELECT && (
                              <PaginationInput />
                          )}
                      </div>

                      <ExecuteButton 
                          activeTabId={activeTab.id}
                      />
                  </div>
              </form>

                  {/* 초기 상태 메시지 */}
              {!form.formState.isSubmitting && !activeTab.result && activeTab.sql.length === 0 && (
                  <div className="mt-7 p-7 bg-sky-50 dark:bg-slate-700 border border-dashed border-sky-200 dark:border-slate-600 rounded-lg text-center italic">
                      결과 표시를 위해 SQL 을 입력하고 실행해주세요.
                  </div>
              )}
          </FormProvider>
      </div>
  );
};
