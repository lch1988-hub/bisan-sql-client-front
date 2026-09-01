// 'use client';
//
// import React, { useEffect, useRef, useState } from 'react';
// import { useMetadataStore } from '@/stores/metadataStore';
// import { useSuggestions, type SuggestionItem } from '@/hooks/useSuggestions';
//
// interface AutocompleteSuggestionProps {
//     position: { top: number; left: number };
//     onClose: () => void;
//     onSelect: (suggestion: string) => void;
//     currentInputWord?: string;
//     fromTable?: string | null;
// }
//
// // 스타일 정의 (컴포넌트 밖으로 분리하여 재사용 가능하도록)
// const modalStyle: React.CSSProperties = {
//     position: 'fixed',
//     top: 0,
//     left: 0,
//     zIndex: 10000,
//     backgroundColor: '#ffffff',
//     border: '2px solid #3b82f6',
//     borderRadius: '8px',
//     boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
//     maxWidth: '400px',
//     maxHeight: '400px',
//     overflow: 'hidden',
//     display: 'flex',
//     flexDirection: 'column',
// };
//
// const headerStyle: React.CSSProperties = {
//     padding: '12px 16px',
//     backgroundColor: '#3b82f6',
//     color: 'white',
//     fontWeight: 'bold',
//     fontSize: '14px',
//     borderBottom: '1px solid #2563eb',
// };
//
// const listStyle: React.CSSProperties = {
//     overflowY: 'auto',
//     flex: 1,
//     padding: 0,
//     margin: 0,
//     listStyle: 'none',
// };
//
// /**
//  * 자동완성 제시 컴포넌트
//  */
// export default function AutocompleteSuggestion({
//     position,
//     onClose,
//     onSelect,
//     currentInputWord = '',
//     fromTable = null,
// }: AutocompleteSuggestionProps) {
//     const { groupedByTable } = useMetadataStore();
//     const [selectedIndex, setSelectedIndex] = useState(0);
//     const modalRef = useRef<HTMLDivElement>(null);
//
//     // suggestions 데이터 계산 (hook 사용)
//     const suggestions = useSuggestions(groupedByTable, currentInputWord, fromTable);
//
//     // 선택 항목 변경 시 디버깅 로그
//     useEffect(() => {
//         if (fromTable) {
//             console.log(' [Autocomplete] FROM 테이블:', fromTable);
//         }
//     }, [fromTable]);
//
//     // 키보드 이벤트 처리
//     const handleKeyDown = (e: KeyboardEvent) => {
//         if (e.key === 'Escape') {
//             onClose();
//         } else if (e.key === 'ArrowDown') {
//             e.preventDefault();
//             setSelectedIndex((prev) =>
//                 prev < suggestions.length - 1 ? prev + 1 : prev
//             );
//         } else if (e.key === 'ArrowUp') {
//             e.preventDefault();
//             setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
//         } else if (e.key === 'Enter' || e.key === 'Tab') {
//             e.preventDefault();
//             const selectedItem = suggestions[selectedIndex];
//             if (selectedItem) {
//                 onSelect(selectedItem.name);
//                 onClose();
//             }
//         }
//     };
//
//     useEffect(() => {
//         window.addEventListener('keydown', handleKeyDown);
//         return () => window.removeEventListener('keydown', handleKeyDown);
//     }, [selectedIndex, suggestions]);
//
//     const handleClickOutside = (e: React.MouseEvent) => {
//         if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
//             onClose();
//         }
//     };
//
//     // 동적 스타일 함수
//     const getItemStyle = (index: number): React.CSSProperties => ({
//         padding: '10px 16px',
//         cursor: 'pointer',
//         backgroundColor: index === selectedIndex
//             ? '#3b82f6'
//             : index % 2 === 0 ? '#f9fafb' : '#ffffff',
//         display: 'flex',
//         alignItems: 'center',
//         gap: '8px',
//         fontSize: '14px',
//         transition: 'background-color 0.15s ease',
//         borderBottom: index !== suggestions.length - 1 ? '1px solid #e5e7eb' : 'none',
//     });
//
//     return (
//         <div
//             ref={modalRef}
//             style={{ ...modalStyle, top: position.top, left: position.left }}
//             onClick={handleClickOutside}
//         >
//             <div style={headerStyle}>
//                 자동완성 ({suggestions.length}개 항목)
//                 {fromTable && (
//                     <span style={{ marginLeft: '10px', fontSize: '12px' }}>FROM: {fromTable}</span>
//                 )}
//                 <span style={{ float: 'right', opacity: 0.8, fontSize: '12px' }}>
//                      이동 • Enter 선택 • ESC 닫기
//                 </span>
//             </div>
//
//             {suggestions.length === 0 ? (
//                 <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
//                     자동완성 항목이 없습니다
//                 </div>
//             ) : (
//                 <ul style={listStyle}>
//                     {suggestions.map((item, index) => (
//                         <li
//                             key={`${item.type}-${item.name}`}
//                             style={getItemStyle(index)}
//                             onClick={() => {
//                                 onSelect(item.name);
//                                 onClose();
//                             }}
//                             onMouseEnter={() => setSelectedIndex(index)}
//                         >
//                             <span style={{ fontSize: '16px', opacity: 0.7 }}>
//                                 {item.type === 'table' ? '' : ''}
//                             </span>
//
//                             <span style={{ flex: 1 }}>{item.name}</span>
//
//                             {item.type === 'column' && item.tableName && (
//                                 <span style={{
//                                     fontSize: '10px',
//                                     backgroundColor: '#e5e7eb',
//                                     padding: '2px 6px',
//                                     borderRadius: '4px',
//                                     color: '#6b7280',
//                                 }}>
//                                     {item.tableName}
//                                 </span>
//                             )}
//                         </li>
//                     ))}
//                 </ul>
//             )}
//         </div>
//     );
// }
