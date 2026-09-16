/**
 * SQL 텍스트에서 주석(line/block) 과 문자열 리터럴을 길이 보존 방식으로 마스킹
 *
 * - `-- line comment`: 개행까지 공백으로 치환 (개행 문자는 유지)
 * - `/* block comment *​/`: 종료까지 공백으로 치환 (개행 문자는 유지)
 * - `'string literal'`: Oracle `''` 이스케이프 quote 를 포함한 문자열 전체를 공백으로 치환
 *
 * 목적: 주석이나 문자열 안에 등장하는 SQL 키워드, 괄호, 점(.), 콤마 등이
 * 절(clause) 분석 / paren depth 계산 / alias 추출 등에 오염되는 것을 방지.
 * 예: `SELECT * FROM SALES -- WHERE 1=1` 에서 `-- WHERE` 는 실제 WHERE 절이 아님.
 *
 * 길이 보존 (개행 포함) → 반환 문자열의 각 인덱스가 원본과 1:1 대응.
 * 다운스트림 position/offset/substring 연산이 원본 쿼리 인덱스와 정확히 일치하므로
 * Monaco 커서 위치 기반 로직에 영향을 주지 않는다.
 *
 * 주의: 주석이 없는 쿼리에는 완전한 no-op (문자열 리터럴 내부에 키워드가 없으면 동일 텍스트).
 * 벤치마크(500 케이스)는 SQL 주석이 없으므로 동작 불변.
 */

export function maskNonSqlText(sql: string): string {
  const chars = sql.split('');
  const n = chars.length;
  let i = 0;

  while (i < n) {
    const ch = chars[i];
    const next = chars[i + 1];

    // Line comment: '--' 은 줄 끝까지 (개행 문자는 유지)
    if (ch === '-' && next === '-') {
      while (i < n) {
        const c = chars[i];
        if (c === '\n' || c === '\r') break; // 개행에서 종료, 다음 루프에서 개행 복사
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Block comment: '/* ... */' (개행 문자는 유지, 종료 없이 쿼리 끝까지 가는 비정상 입력도 처리)
    if (ch === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < n) {
        if (chars[i] === '*' && chars[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        const c = chars[i];
        if (c !== '\n' && c !== '\r') chars[i] = ' ';
        i++;
      }
      continue;
    }

    // String literal: '...' (Oracle '`''`' 이스케이프 quote 지원)
    if (ch === "'") {
      chars[i] = ' ';
      i++;
      while (i < n) {
        const c = chars[i];
        if (c === "'") {
          // 연속 quote: 이스케이프된 quote → 문자열 계속됨 (예: 'it''s')
          if (chars[i + 1] === "'") {
            chars[i] = ' ';
            chars[i + 1] = ' ';
            i += 2;
            continue;
          }
          // 닫는 quote → 문자열 종료
          chars[i] = ' ';
          i++;
          break;
        }
        if (c !== '\n' && c !== '\r') chars[i] = ' ';
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join('');
}