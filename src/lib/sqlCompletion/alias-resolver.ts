/**
 * WHERE 절에서 Alias 기반 테이블명 resolution 유틸리티  
 */

export interface TableResolutionResult {
    targetTableNames: string[];  // 단일 테이블이 아닌 모든 FROM 테이블의 배열
    partialNameFromInput: string | null;
}

/**
 * WHERE 절 에서 Alias 기반 테이블명 추출 (예: "A." 입력 시)  
 */
export function resolveAliasInWHERE(
    currentWord: string | undefined,
    aliasToTableName: Record<string, string>,
    tableColumns: Record<string, string[]> | undefined
): TableResolutionResult {
    
    if (!currentWord) {
        // [NEW] 점이 없으면 FROM 에 있는 모든 테이블을 반환
        const availableAliases = Object.keys(aliasToTableName);
        if (availableAliases.length > 0) {
            const tableNames = availableAliases.map(alias => aliasToTableName[alias]);
            
            return { 
                targetTableNames: tableNames,  // 모든 FROM 테이블 반환
                partialNameFromInput: null 
            };
        }
        
        return { targetTableNames: [], partialNameFromInput: null };
    }
    
    // 점이 있는 경우 (A.) - alias 추출  
    let alias: string | null = null;
    
    if (currentWord.includes('.')) {
        const dotIndex = currentWord.indexOf('.');
        alias = currentWord.substring(0, dotIndex).toUpperCase();
    } else if (currentWord.endsWith('.')) {
        // A. 형식만 처리  
        alias = currentWord.substring(0, currentWord.length - 1).toUpperCase();
    } else {
        // 점을 포함하지 않는 경우에도 현재 단어가 alias 인지 확인 (예: "A" 입력 시)
        const potentialAlias = currentWord.toUpperCase();
        if (aliasToTableName[potentialAlias]) {
            // 점이 없으므로 partialNameFromInput 만 설정, targetTableNames 는 해당 테이블 배열
            return { 
                targetTableNames: [aliasToTableName[potentialAlias]],  // 단일 테이블을 배열로 반환
                partialNameFromInput: potentialAlias 
            };
        } else {
            // [NEW] 현재 단어가 alias 가 아니어도 FROM 에 있는 모든 테이블을 사용
            const availableAliases = Object.keys(aliasToTableName);
            if (availableAliases.length > 0) {
                const tableNames = availableAliases.map(alias => aliasToTableName[alias]);
                
                return { 
                    targetTableNames: tableNames,  // 모든 FROM 테이블 반환
                    partialNameFromInput: currentWord  // 사용자가 입력한 부분 ('S' 등)
                };
            }
        }
    }
    
    if (!alias) {
        return { targetTableNames: [], partialNameFromInput: null };
    }
    
    if (!alias || !aliasToTableName[alias]) {
        console.warn('[Completion] ️ Alias not found in mapping:', alias, 'Available aliases:', Object.keys(aliasToTableName));
        return { targetTableNames: [], partialNameFromInput: null };
    }

    let tableName = aliasToTableName[alias];
    
    // [NEW] Find matching table in metadata (case-insensitive)
    const availableTables = tableColumns ? Object.keys(tableColumns) : [];
    const foundTableKey = availableTables.find(key => key.toUpperCase() === tableName.toUpperCase());
    
    if (!foundTableKey) {
        console.warn('[Completion] ️ Table', tableName, '(from alias)', alias, 'not in metadata');
        
        // [NEW] Still return the table name - fallback handler will search all tables
        return { 
            targetTableNames: [tableName],  // 단일 테이블을 배열로 반환
            partialNameFromInput: alias 
        };
    }
    
    // Use the actual key from metadata (may have different casing)
    tableName = foundTableKey;

    return { 
        targetTableNames: [tableName],  // 단일 테이블을 배열로 반환
        partialNameFromInput: alias 
    };
}
