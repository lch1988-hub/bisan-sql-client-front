// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import axios from 'axios'; //  axios 가져오기

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bisan SQL - Next.js",
  description: "SQL 쿼리 실행 도구 (Next.js 버전)",
};

import ThemeManager from '@/components/ThemeManager';
import IndexedDBHydrator from '@/components/IndexedDBHydrator';

//  [수정] 빌드 타임과 런타임 모두에서 안전하게 작동하는 전역 가로채기 메커니즘
if (typeof window !== "undefined") {
  const IS_PROD = process.env.NODE_ENV === 'production';

  if (IS_PROD) {
    const BACKEND_URL = 'http://127.0.0.1:5000'; // 파이썬 waitress 서버 주소

    //  1. Axios 강력 인터셉터 가로채기 (모든 axios 요청에 강제로 주소 접두사 결합)
    axios.interceptors.request.use((config) => {
      if (config.url && config.url.startsWith('/api')) {
        config.url = `${BACKEND_URL}${config.url}`;
      }
      return config;
    }, (error) => {
      return Promise.reject(error);
    });

    //  2. Fetch 전역 가로채기
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (typeof input === 'string' && input.startsWith('/api')) {
        input = `${BACKEND_URL}${input}`;
      }
      return originalFetch(input, init);
    };
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-300">
        {children}
        <ThemeManager />
        <IndexedDBHydrator />
      </body>
    </html>
  );
}
