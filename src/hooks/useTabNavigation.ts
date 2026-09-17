'use client';

import { useEffect, useCallback } from 'react';
import { useTabsStore, type TabData } from '@/stores/tabsStore';

interface UseTabNavigationOptions {
  onTabSwitch?: () => void;
}

/**
 * 탭 전환 로직을 관리하는 custom hook
 * Alt+Arrow 키로 탭 전환 및 커서 위치 복원 담당
 */
export function useTabNavigation(options: UseTabNavigationOptions = {}) {
  const { onTabSwitch } = options;

  // 전역 키다운 리스너 등록 (Alt+Arrow 로 탭 전환)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        
        useTabsStore.getState().switchTab(e.key === 'ArrowLeft' ? 'left' : 'right');
        
        // 외부 콜백 호출 (필요시)
        if (onTabSwitch) {
          onTabSwitch();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [onTabSwitch]);

  // 커서 위치 복원 기능 (재시도 로직 및 스크롤 복원 포함)
  const restoreCursorPosition = useCallback(async (activeTab: TabData, maxRetries = 3): Promise<{ lineNumber: number; column: number; restoredFromSave: boolean } | null> => {
    if (!activeTab?.id || typeof window === 'undefined') {
      console.warn('[useTabNavigation] 유효하지 않은 탭:', activeTab);
      return null;
    }

    let attempts = 0;
    
    const tryRestore = (): Promise<{ lineNumber: number; column: number; restoredFromSave: boolean } | null> => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          const monacoRef = window.monacoInstanceRef;
          
          if (!monacoRef?.editor || !monacoRef.editor.getModel()) {
            attempts++;
            
            if (attempts < maxRetries) {
              resolve(tryRestore());
            } else {
              console.error('[useTabNavigation] Monaco 에디터 준비 불가 - 최대 시도 도달');
              resolve(null);
            }
            return;
          }

          try {
            // store 에서 현재 탭의 실제cursorPosition 읽기 (React state 아님!)
            const currentTabData = useTabsStore.getState().getActiveTab();
            
            if (!currentTabData) {
              console.error('[useTabNavigation] Store 에 탭 데이터가 없음:', activeTab.id);
              resolve(null);
              return;
            }

            const savedCursorPos = currentTabData?.cursorPosition ?? 0;
            const currentSqlLength = (currentTabData?.sql || '').length;

            if (savedCursorPos > 0 && savedCursorPos <= currentSqlLength) {
              // 저장된 커서 위치가 있으면 복원
              const position = monacoRef.editor.getModel().getPositionAt(savedCursorPos);
              
              // 1. 커서 위치 설정
              monacoRef.editor.setPosition(position);
              
              // 2. 스크롤 위치도 해당 라인으로 이동 (revealLineInCenter)
              monacoRef.editor.revealLineInCenter(position.lineNumber);
              
              // 3. 포커스 집중
              try {
                monacoRef.editor.focus();
              } catch (e) {
                console.warn('[useTabNavigation] 포커스 실패:', e);
              }

              resolve({ 
                lineNumber: position.lineNumber, 
                column: position.column,
                restoredFromSave: true
              });
            } else {
              // 저장된 위치가 없으면 맨 끝으로 이동하고 위치 저장
              const model = monacoRef.editor.getModel();
              const lastLine = model.getLineCount();
              const lastCol = Math.max(1, model.getLineLength(lastLine)) + 1;
              const endOffset = model.getOffsetAt({ lineNumber: lastLine, column: lastCol });
              
              monacoRef.editor.setPosition({ lineNumber: lastLine, column: lastCol });
              
              // 스크롤도 맨끝으로
              try {
                const model = monacoRef.editor.getModel();
                const lineCount = model.getLineCount();
                if (lineCount > 0) {
                  monacoRef.editor.revealLineInCenter(lineCount);
                }
              } catch (e) {
                console.warn('[useTabNavigation] 스크롤 실패:', e);
              }

              // 포커스 집중
              try {
                monacoRef.editor.focus();
              } catch (e) {
                console.warn('[useTabNavigation] 포커스 실패:', e);
              }

              // 위치 저장해두기
              if (currentTabData.id) {
                const savePos = Math.min(endOffset, currentSqlLength);
                useTabsStore.getState().updateTab(currentTabData.id, { 
                  sql: currentTabData.sql || '',
                  cursorPosition: savePos > 0 ? savePos : lastLine * 80 + lastCol
                });
              }

              resolve({ 
                lineNumber: lastLine, 
                column: lastCol,
                restoredFromSave: false
              });
            }
          } catch (e) {
            console.error('[useTabNavigation] 예외 발생:', e);
            resolve(null);
          }
        }, 100 * (attempts + 1)); // 지연 시간 재시도마다 증가
      });
    };

    return tryRestore();
  }, []);

  return {
    restoreCursorPosition,
  };
}
