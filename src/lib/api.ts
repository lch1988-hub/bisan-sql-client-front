// src/lib/api.ts
import axios from 'axios';

//  1. 현재 환경이 빌드(배포) 상태인지 확인
const IS_PROD = process.env.NODE_ENV === 'production';

//  2. 파이썬 백엔드 주소 설정
export const BACKEND_URL = 'http://127.0.0.1:5000';

/**
 * 환경에 맞는 최적의 API 요청 주소를 반환합니다.
 * @param path '/api/table-metadata' 같은 상대 경로
 */
export function getApiUrl(path: string): string {
  // return IS_PROD ? `${BACKEND_URL}${path}` : path;
  return `${BACKEND_URL}${path}`;
}
