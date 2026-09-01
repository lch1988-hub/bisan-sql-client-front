/**
 * FROM 절 및 SELECT 절에서 테이블명 추출 유틸리티  
 */

import { extractFROMClauseContent } from './clause-analyzer';

export interface TableExtractionResult {
    targetTableName: string | null;
    partialNameFromInput: string | null;
}

/**
 * FROM 절에서 테이블명 추출 (여러 테이블, JOIN 문법 지원)  
 */
export function extractTableFromFROMClause(
    upperText: string,
    tableColumns: Record<string, string[]> | undefined
): TableExtractionResult {

    // FROM 절 전체 추출 (줄바꿈 포함 + 다음 키워드까지)  
    const fromContent = extractFROMClauseContent(upperText);

    if (!fromContent) {
        return {targetTableName: null, partialNameFromInput: null};
    }

    console.log('[DEBUG] FROM 절 전체:', fromContent);

    // 콤마 단위로 분리하여 마지막 부분 추출 (여러 테이블 지원)  
    const tableParts = fromContent.split(',');
    let currentPart = tableParts[tableParts.length - 1]?.trim() || '';

    console.log('[DEBUG] 콤마 분리 후 개수:', tableParts.length);
    console.log('[DEBUG] 마지막 파티션:', tableParts[tableParts.length - 1]);

    // JOIN 키워드 제외 처리  
    if (currentPart.match(/^(?:INNER\s+|LEFT\s+|RIGHT\s+|OUTER\s+|FULL\s+)?JOIN\b/i)) {
        return {targetTableName: null, partialNameFromInput: null};
    }

    // alias 제거: "TABLE_NAME AS alias"  "TABLE_NAME", "TABLE_NAME alias"  "TABLE_NAME"  
    currentPart = currentPart.replace(/\bAS\b/gi, '').trim();

    // 콤마 이후의 접두어 키워드 (예: CROSS JOIN) 제거  
    const tablePartsNoJoin = currentPart.split(/\s+(?:JOIN|ON)\b/);
    if (tablePartsNoJoin.length > 1 && tablePartsNoJoin[0]) {
        currentPart = tablePartsNoJoin[0].trim();
    }

    // 실제 테이블명 추출: "INSTALLSPEC" 또는 "aa" 또는 INSTALLSPEC 또는 aa  
    const parts = currentPart.split(/\s+/);

    //  **quote 제거 후 대문자 변환**: "E  E  E  
    let partialRawName = parts[0] || '';
    partialRawName = partialRawName.replace(/^["`']|["`']$/g, '');  // quote 제거  
    let partialName = partialRawName.toUpperCase();  // 그 다음 대문자

    if (!partialName) {
        return {targetTableName: null, partialNameFromInput: null};
    }

    // 불완전한 이름  메타데이터에서 완전한 이름 찾기  
    const metaKeys = Object.keys(tableColumns || {});
    const allMatches = metaKeys.filter((key: string) =>
        key.startsWith(partialName) && key.length >= partialName.length
    );

    console.log('[DEBUG] All matches for', partialName, ':', allMatches);

    if (allMatches.length > 0) {
        const exactMatch = allMatches.find((key: string) => key === partialName);
        const targetTableName = exactMatch || allMatches[0];

        console.log('[DEBUG]  Enhanced', partialName, '', targetTableName);
        return {
            targetTableName,
            partialNameFromInput: partialName
        };
    } else {
        // 매칭되는 테이블 없음  
        console.log(' No matching tables for:', partialName);
        return {
            targetTableName: partialName,
            partialNameFromInput: partialName
        };
    }
}

/**
 * SELECT 절 이후 (FROM 이전) 에서-table명/alias 추출  
 */
export function extractTableFromSelectOnly(
    aliasToTableName: Record<string, string>,
    tableColumns: Record<string, string[]> | undefined
): TableExtractionResult {
    
    const aliases = Object.keys(aliasToTableName);
    if (aliases.length === 0) {
        return { targetTableName: null, partialNameFromInput: null };
    }

    let potentialTable: string | undefined = Object.values(aliasToTableName)[0];
    
    console.log('[DEBUG] Extracted from alias:', potentialTable);

    const metaKeys = Object.keys(tableColumns || {});
    const allMatches = metaKeys.filter((key: string) => 
        key.startsWith(potentialTable?.toUpperCase() || '') && 
        (potentialTable ? key.length >= potentialTable.length : true)
    );

    console.log('[DEBUG] All matches:', allMatches);

    if (allMatches.length > 0) {
        const exactMatch = allMatches.find((key: string) => 
            key === (potentialTable?.toUpperCase() || '')
        );
        
        const targetTableName = exactMatch || allMatches[0];
        
        console.log('[DEBUG]  Selected:', targetTableName);
        console.log('[DEBUG]  Metadata check:', { 
            exists: !!tableColumns?.[targetTableName],  
            columnCount: tableColumns?.[targetTableName]?.length || 0  
        });

        return { 
            targetTableName, 
            partialNameFromInput: potentialTable?.toUpperCase() || null 
        };
    } else {
        console.warn('No matching tables for', potentialTable);
        return { targetTableName: null, partialNameFromInput: null };
    }
}
