'use client';

import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useMetadataStore } from "@/stores/metadataStore";
import type { TableColumns } from '@/lib/sqlCompletion/types';
import { setupMonacoSQLCompletion, setupSQLLanguage } from '@/lib/sqlCompletion/providers';

// Dynamic import with SSR disabled - CRITICAL for Next.js
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-[50vh] flex items-center justify-center bg-slate-50 text-slate-400">
        에디터 로드 중...
      </div>
    ),
  }
);

interface SQLMonacoEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  height?: string | number;
  onCursorChange?: (position: number) => void;
  onScroll?: () => void;
  readOnly?: boolean;
  onSubmit?: (selectedText: string | null, selectionStart: number, selectionEnd: number) => void;
  onMountComplete?: (editor: any) => void;  // Mount 완료 시 호출될 콜백 추가
}

export default function SQLMonacoEditor({
  value = '',
  onChange,
  height = '100%',
  onCursorChange,
  onScroll,
  readOnly = false,
  onSubmit,
  onMountComplete,
}: SQLMonacoEditorProps) {
  const editorRef = useRef<any>(null);
  const monacoInstanceRef = useRef<any>(null);

  // 다크 모드 감지
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    // 초기 테마 확인
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                     localStorage.getItem('theme') === 'dark' ||
                     (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDarkMode(isDark);
    };

    checkTheme();

    // MutationObserver 로 클래스 변경 감지
    const observer = new MutationObserver(() => {
      checkTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);
  // Handle editor mount
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoInstanceRef.current = monaco;

    // 전역 변수로 저장하여 ActiveEditor 에서 참조 가능하게 함
    if (typeof window !== 'undefined') {
      (window as any).monacoInstanceRef = { editor, monaco };
    }

    // Monaco 에 메타데이터 바인딩
    syncMetadataWithMonaco();

    // 커서 위치 실시간 추적
    editor.onDidChangeCursorPosition((e: any) => {
      const offset = editor.getModel().getOffsetAt(e.position);
      
      // ⭐ 복원 중이면 store 업데이트 skip!
      if (editor._restoringFlag) {
        return;
      }
      
      if (onCursorChange) {
        onCursorChange(offset);
      }
    });

    // Ctrl+Enter 로 서브밋
    if (onSubmit) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        const selection = editor.getSelection();
        
        if (selection && !selection.isEmpty()) {
          const selectedText = editor.getModel().getValueInRange(selection);
          
          const startOffset = editor.getModel().getOffsetAt({
            lineNumber: selection.startLineNumber,
            column: selection.startColumn
          });
          
          onSubmit(selectedText, startOffset, startOffset + selectedText.length);
        } else {
          const position = editor.getPosition();
          if (position) {
            const offset = editor.getModel().getOffsetAt({
              lineNumber: position.lineNumber,
              column: position.column
            });
            onSubmit(null, offset, offset);
          } else {
            onSubmit(null, 0, 0);
          }
        }
      });
    }

    // SQL 언어 설정 적용
    setupSQLLanguage(monaco);
    setupMonacoSQLCompletion(monaco);

    // Mount 완료 알림 (부모 컴포넌트에서 커서 복원을 수행) - 100ms 딜레이로 effect 처리 여부 확인
    
    if (onMountComplete) {
      setTimeout(() => {
        if (!editor || !editor.getModel()) return;
        
        // ⭐ Effect 에서 이미 복원 완료했으면 skip (editor._restoringFlag 체크)
        if (!editor._restoringFlag) {
          onMountComplete(editor);
          return;
        }
        
        onMountComplete(editor);
      }, 100);
    }
  };


  // 메타데이터 동기화
  const syncMetadataWithMonaco = () => {
    try {
      const tables = useMetadataStore.getState().tables;
      const columnsByTable = useMetadataStore.getState().columnsByTable;
      
      if (!tables || tables.length === 0) return;

      // 테이블 이름 목록 추출
      const tableNames = tables.map(t => t.TABLE_NAME);
      
      // sqlTableColumns 구조: { users: ['id', 'name'], products: [...] }
      const tableColumns: TableColumns = {};
      tables.forEach((table: { TABLE_NAME: string }) => {
        const tableName = table.TABLE_NAME;
        const columns = columnsByTable[tableName]?.map((col: { COLUMN_NAME: string, COLUMNS_COMMENTS: string }) => col.COLUMN_NAME) || [];
        
        if (columns.length > 0) {
          tableColumns[tableName] = columns.filter(Boolean);
        }
      });

      // Monaco 가 참조하는 전역 변수 설정
      (window as any).sqlAutoCompleteKeywords = tableNames;
      (window as any).sqlTableColumns = tableColumns;
    } catch (err) {
      console.error('Monaco metadata binding failed:', err);
    }
  };

  // Handle editor options update
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        readOnly,
      });
    }
  }, [readOnly]);

  return (
    <div style={{ position: 'relative', height }}>
      <MonacoEditor
        height={height}
        language="sql"
        value={value}
        onChange={(newValue) => {
          // Monaco passes string | undefined, we handle undefined case
          if (newValue !== undefined && onChange) {
            onChange(newValue);
          }
        }}
        onMount={handleEditorMount}
        theme={isDarkMode ? 'vs-dark' : 'vs-light'}
        options={{
          minimap: { enabled: false },
          fontSize: 16,
          fontFamily: 'monospace',
          lineNumbers: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          suggestOnTriggerCharacters: false,  //  자동완성 끄기 (Ctrl+Space 만 활성화)
          quickSuggestions: {
            other: false,     // 타입 중 자동완성 끌기
            comments: false,
            strings: false,
          },
          tabCompletion: 'off' as const,
          formatOnPaste: false,
          formatOnType: false,
          autoClosingDelete: 'always',  // 선택된 텍스트 백스페이스 삭제 보장
          autoIndent: 'none' as const,
          folding: false,
          lineDecorationsWidth: 30,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: false,
            verticalSliderSize: 8,
            horizontalSliderSize: 8,
          },
          padding: { top: 10, bottom: 10 },
          lineNumbersMinChars: 5,
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
