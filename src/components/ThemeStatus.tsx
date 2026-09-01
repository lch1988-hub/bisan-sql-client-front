'use client';

import React, { useEffect, useState } from 'react';

/**
 * 현재 테마 상태를 표시하는 Client Component (debugging 용)
 */
export function ThemeStatus() {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // 브라우저 로드 후 테마 상태 확인
        const checkTheme = () => {
            const darkMode = document.documentElement.classList.contains('dark');
            setIsDark(darkMode);
        };

        checkTheme();

        // MutationObserver 로 클래스 변경 감지
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { 
            attributes: true, 
            attributeFilter: ['class'] 
        });

        return () => observer.disconnect();
    }, []);

    return (
        <div 
            className="fixed bottom-4 left-4 z-50 px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-sm transition-colors duration-300 font-bold"
            style={{ 
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                color: isDark ? '#f1f5f9' : '#ffffff'
            }}
        >
            {isDark ? ' DARK MODE' : '️ LIGHT MODE'}
        </div>
    );
}
