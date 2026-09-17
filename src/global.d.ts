// Next.js 글로벌 타입 정의
declare global {
  interface Window {
    confirm(message?: string): boolean;

    // 메타데이터 전역 (useMetadataSync 설정)
    sqlAutoCompleteKeywords?: string[];          // 테이블명 목록
    sqlTableColumns?: Record<string, string[]>;  // 테이블별 컬럼 목록
    sqlConfigured?: boolean;                     // SQL 언어 설정 완료 플래그

    // Monaco 인스턴스 (cross-component access용)
    monacoInstanceRef?: {
      editor: MonacoEditorLike;  // Monaco editor instance (최소 구조 타입)
      monaco: unknown;
    };

    // Monaco 네임스페이스 (최소 형태 - CompletionItemKind 만 사용)
    monaco?: {
      languages?: {
        CompletionItemKind: Record<string, number>;
      };
    };
  }
}

/**
 * Monaco editor 인스턴스의 최소 구조 타입
 * 앱에서 실제로 사용하는 메서드만 정의 (라이브러리 경계)
 */
interface MonacoEditorLike {
  trigger(source: string, handler: string, payload: unknown): void;
  getModel(): MonacoTextModelLike;
  getPosition(): MonacoPositionLike | null;
  setPosition(position: MonacoPositionLike): void;
  revealLineInCenter(lineNumber: number): void;
  focus(): void;
  _restoringFlag?: boolean;  // 커서 복원 중 플래그 (커스텀 프로퍼티)
}

interface MonacoTextModelLike {
  getPositionAt(offset: number): MonacoPositionLike;
  getOffsetAt(position: MonacoPositionLike): number;
  getLineCount(): number;
  getLineLength(lineNumber: number): number;
  getValue(): string;
  getValueInRange(range: MonacoSelectionLike): string;
}

interface MonacoPositionLike {
  lineNumber: number;
  column: number;
}

interface MonacoSelectionLike {
  isEmpty(): boolean;
  startLineNumber: number;
  startColumn: number;
}

export {};
