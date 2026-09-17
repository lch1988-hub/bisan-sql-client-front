/**
 * Monaco SQL 자동완성 제공자 설정 및 언어 구성 파일 - SSR 안전 버전
 */

import { createCompletionSuggestions as internalCreateSuggestions } from './index';
import type { MonacoPosition, MonacoWord, CompletionItem } from './types';

// 전역 상수 제거 - 모든 함수 내부에서 실행 시점에 가져옴

/**
 * Monaco completion items 생성 (메인 진입점)
 */
export function createCompletionSuggestions(
    modelValue: string,        
    position: MonacoPosition,             
    word: MonacoWord,                 
    sqlKeywords: string[],     
    tableColumns?: Record<string, string[]>  
): CompletionItem[] {
    return internalCreateSuggestions(modelValue, position, word, sqlKeywords, tableColumns);
}

/**
 * Monaco 에 디폴트 SQL 자동완성 제공자 설정 (Ctrl+Space 만 활성화)
 */
export function setupMonacoSQLCompletion(monaco: any) {
    const sqlKeywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE',  
        'CREATE', 'ALTER', 'DROP', 'JOIN', 'INNER JOIN', 'LEFT JOIN',
        'RIGHT JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING',  
        'LIMIT', 'OFFSET', 'UNION', 'AND', 'OR', 'NOT', 
        'IS NULL', 'IS NOT NULL', 'BETWEEN', 'LIKE', 'IN',  
        'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
        'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'  
    ];

    monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [],  
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);  
            const range = {
                startLineNumber: position.lineNumber,  
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,  
                endColumn: word.endColumn,
            };

            const suggestions = createCompletionSuggestions(
                model.getValue(),  
                position,           
                word,               
                sqlKeywords,  
                window.sqlTableColumns || {}
            );

            return {
                suggestions: suggestions.map((suggestion) => ({  
                    ...suggestion,
                    range,
                }))  
            };
        },  
    });

    monaco.editor.addKeybindingRule({  
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space,  
        command: 'editor.action.triggerSuggest'  
    });
}

/**
 * Monaco 에 SQL 언어 설정 적용
 */  
export function setupSQLLanguage(monaco: any): boolean {
    if (window.sqlConfigured) return false;

    monaco.languages.register({ id: 'sql' });

    const sqlKeywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE',  
        'CREATE', 'ALTER', 'DROP', 'JOIN', 'INNER JOIN', 'LEFT JOIN',
        'RIGHT JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING',  
        'LIMIT', 'OFFSET', 'UNION', 'AND', 'OR', 'NOT', 
        'IS NULL', 'IS NOT NULL', 'BETWEEN', 'LIKE', 'IN',  
        'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
        'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'
    ];

    monaco.languages.setMonarchTokensProvider('sql', {
        keywords: sqlKeywords,
        operators: ['=', '>', '<', '>=', '<=', '<>', '!=', '+', '-', '*', '/'],
        
        tokenizer: {
            root: [
                [new RegExp(`(${sqlKeywords.join('|')})`, 'i'), 'keyword.sql'],
                [/[@#$@=<>!+\-*\/]/, 'operators'],  
                [/\d+(\.\d+)?/, 'number.sql'],
                [/\"[^\"]*\"/, 'string.sql'],
                [/'[^']*'/, 'string.sql'],
                [/--.*/, 'comment.sql'],  
                [/\/\*/, 'comment.sql', '@comment'],
                [/[a-zA-Z_][\w]*(?=\s*(?:,|\(|AS|FROM|WHERE|AND|OR|ORDER|GROUP|LIMIT)|$)/i, 'identifier.sql']
            ],
            
            comment: [
                [/[^*/]+/, 'comment.sql'],  
                [/\*\//, 'comment.sql', '@pop'],  
                [/./, 'comment.sql']  
            ]  
        }  
    });

    window.sqlConfigured = true;  
    
    return true;  
}
