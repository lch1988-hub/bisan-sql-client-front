'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTabsStore, type TabData } from '@/stores/tabsStore';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TabItemProps {
    tab: TabData;
    isActive: boolean;
}

export const TabItem: React.FC<TabItemProps> = ({ tab, isActive }) => {
    const setActiveTab = useTabsStore((state) => state.setActiveTab);
    const closeTab = useTabsStore((state) => state.closeTab);
    const updateTab = useTabsStore((state) => state.updateTab);

    // 첫 번째 탭 (고정 탭) 확인
    const isFirstTab = tab.id === useTabsStore.getState().tabs[0]?.id;

    // 이름 편집 상태
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(tab.name);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sortable hooks - 전체 div 가 드래그 영역
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ 
        id: tab.id,
    });

    // 스타일 - 드래그 시 원본은 투명해지고 오버레이가 마우스를 따라옴
    const style = {
        transform: CSS.Transform.toString(transform),
        transition: 'transform 80ms ease-out',
        opacity: isDragging ? 0.4 : 1,  // 드래그 중 원본은 훨씬 투명하게
        boxShadow: isDragging 
            ? 'none'  // 오버레이에서 그림자 처리 (탭 중복 방지)
            : 'none',
        zIndex: isDragging ? 50 : undefined,
    };

    // 편집 중일 때 input 에 집중
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // 클릭 핸들러 - TabBar 의 delay/tolerance 설정이 click 과 drag 를 나누어 줌
    const handleClick = () => {
        if (!isEditing) {
            setActiveTab(tab.id);
        }
    };

    const handleDoubleClick = () => {
        if (!isDragging && !isEditing) {
            setIsEditing(true);
            setEditName(tab.name);
        }
    };

    // 이름 저장
    const saveName = () => {
        if (editName.trim()) {
            updateTab(tab.id, { name: editName.trim() });
        } else {
            setEditName(tab.name);
        }
        setIsEditing(false);
    };

    // 이름 취소 (ESC)
    const cancelEdit = () => {
        setEditName(tab.name);
        setIsEditing(false);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        closeTab(tab.id);
    };
    
    // SSR 안전화 - 마운팅 완료 후 드래그 기능 활성화
    const [hasMounted, setHasMounted] = useState(false);
    
    useEffect(() => {
        setHasMounted(true);
    }, []);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center px-4 py-2.5 rounded-t-lg transition-all duration-200 border-b-[3px] select-none ${
                isActive 
                    ? 'bg-slate-600 text-white border-indigo-600' 
                    : 'bg-slate-700 text-slate-400 border-transparent hover:bg-slate-650'
            }`}
            {...(hasMounted && attributes)}
            {...(hasMounted && listeners)}
            onClick={handleClick}
            onDoubleClick={hasMounted ? handleDoubleClick : undefined}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            saveName();
                        } else if (e.key === 'Escape') {
                            cancelEdit();
                        }
                    }}
                    className="bg-slate-500 text-white px-2 py-1 rounded outline-none"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
                    {tab.name || '새 SQL'}
                </span>
            )}
            
            {!isFirstTab && !isEditing && (
                <button
                    onClick={handleClose}
                    className={`ml-auto px-1 py-0 bg-transparent border-none rounded transition-all duration-200 ${
                        isActive 
                            ? 'text-white hover:text-red-400' 
                            : 'text-slate-400 hover:text-red-400'
                    } hover:bg-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible`}
                    title="탭 닫기"
                >
                    ×
                </button>
            )}
        </div>
    );
};