/**
 * API 클라이언트
 *
 * 환경변수 NEXT_PUBLIC_API_URL을 기본 URL로 사용하며,
 * 설정되지 않은 경우 localhost:8000을 사용합니다.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API 클라이언트 함수
 *
 * @param endpoint - API 엔드포인트 (예: '/api/meetings')
 * @param options - fetch 옵션
 * @returns API 응답 데이터
 * @throws ApiError - API 에러 발생 시
 * @throws Error - 네트워크 에러 발생 시
 */
export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options?.headers || {}),
    },
  };

  const response = await fetch(url, mergedOptions);

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    throw new ApiError(response.status, errorMessage);
  }

  return response.json() as Promise<T>;
}

export default apiClient;
