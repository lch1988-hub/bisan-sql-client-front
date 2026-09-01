// Next.js 글로벌 타입 정의
declare global {
  interface Window {
    confirm(message?: string): boolean;
  }
}

export {};
