import type {TableListEntry, ColumnDetailEntry} from '../stores/metadataStore';

/**
 * 테이블 목록을 그리드 데이터 형식으로 변환 (목록용)
 */
export function tablesToGridData(
    tables: TableListEntry[], 
    selectedTable: string | null
) {
    return tables.map(table => ({
        TABLE_NAME: table.TABLE_NAME || '',
        TABLE_COMMENTS: table.TABLE_COMMENTS || '코멘트 없음',
        STATUS: selectedTable === table.TABLE_NAME ? '선택됨' : '클릭하여 상세보기'
    }));
}

/**
 * 컬럼 상세 정보를 그리드 데이터 형식으로 변환 (상세용)
 */
export function columnDetailsToGridData(columns: ColumnDetailEntry[]) {
    return columns.map(col => ({
        COLUMN_NAME: col.COLUMN_NAME || '',
        COLUMNS_COMMENTS: col.COLUMNS_COMMENTS || '코멘트 없음'
    }));
}
