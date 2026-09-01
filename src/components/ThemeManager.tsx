'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// ThemeToggler 는 SSR 비활성화 (Client Component 내에서 safe)
const ThemeToggler = dynamic(
  () => import('@/components/ThemeToggle').then(mod => ({ default: mod.ThemeToggler })),
  { 
    ssr: false,
    loading: () => null
  }
);

export function useInitTheme() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 초기 테마 확인 및 적용
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme = 'light';
    if (savedTheme) {
      initialTheme = savedTheme;
    } else if (prefersDark) {
      initialTheme = 'dark';
    }

    // HTML 태그에 클래스 적용
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    
    console.log(`[ThemeManager] 초기 테마 적용: ${initialTheme}`);
  }, []);
}

export default function ThemeManager() {
  useInitTheme();

  return (
    <><ThemeToggler /></>
  );
}
