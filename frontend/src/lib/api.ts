/**
 * API 클라이언트
 *
 * 환경변수 NEXT_PUBLIC_API_URL을 기본 URL로 사용하며,
 * 설정되지 않은 경우 localhost:8000을 사용합니다.
 */

import type {
  AgendaType,
  BillCreateData,
  BillDetail,
  BillsResponse,
  MeetingSummaryType,
  ParticipantType,
  PublicationType,
  ReviewQueueResponse,
  SubtitleHistoryType,
  SubtitleType,
  VerificationStatsType,
} from '@/types';

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
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    throw new ApiError(response.status, errorMessage);
  }

  return response.json() as Promise<T>;
}

/**
 * 회의록 내보내기 다운로드
 *
 * @param meetingId - 회의 ID
 * @param format - 내보내기 형식 ('markdown' | 'srt' | 'json' | 'official')
 */
export async function downloadTranscript(
  meetingId: string,
  format: 'markdown' | 'srt' | 'json' | 'official' = 'markdown'
): Promise<void> {
  const url = `${API_BASE_URL}/api/meetings/${meetingId}/export?format=${format}`;
  const response = await fetch(url);

  if (!response.ok) {
    let errorMessage = `다운로드 실패: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, errorMessage);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
  const ext = format === 'markdown' ? 'md' : format === 'official' ? 'txt' : format;
  const filename = filenameMatch?.[1] || `회의록.${ext}`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// =============================================================================
// VOD STT Processing
// =============================================================================

export interface SttTaskResponse {
  task_id: string | null;
  meeting_id: string;
  status: string;
  message: string;
}

export interface SttStatusResponse {
  task_id?: string | null;
  meeting_id: string;
  status: 'none' | 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  error: string | null;
}

/**
 * VOD STT 처리 시작
 *
 * @param meetingId - 회의 ID
 * @returns STT 태스크 정보
 */
export async function startSttProcessing(
  meetingId: string
): Promise<SttTaskResponse> {
  return apiClient<SttTaskResponse>(`/api/meetings/${meetingId}/stt`, {
    method: 'POST',
  });
}

/**
 * VOD STT 처리 상태 조회
 *
 * @param meetingId - 회의 ID
 * @returns STT 처리 상태 정보
 */
export async function getSttStatus(
  meetingId: string
): Promise<SttStatusResponse> {
  return apiClient<SttStatusResponse>(`/api/meetings/${meetingId}/stt/status`);
}

// =============================================================================
// Subtitle Edit API
// =============================================================================

/**
 * 자막 수정 데이터 (단건)
 */
export interface SubtitleUpdateData {
  text?: string;
  speaker?: string;
}

/**
 * 배치 수정 아이템
 */
export interface SubtitleBatchItem {
  id: string;
  text?: string;
  speaker?: string;
}

/**
 * 배치 수정 응답
 */
export interface SubtitleBatchResponse {
  updated: number;
  items: SubtitleType[];
}

/**
 * 단건 자막 수정
 *
 * @param meetingId - 회의 ID
 * @param subtitleId - 자막 ID
 * @param data - 수정할 데이터 (text, speaker)
 * @returns 수정된 자막 객체
 */
export async function updateSubtitle(
  meetingId: string,
  subtitleId: string,
  data: SubtitleUpdateData
): Promise<SubtitleType> {
  return apiClient<SubtitleType>(
    `/api/meetings/${meetingId}/subtitles/${subtitleId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

/**
 * 배치 자막 수정
 *
 * @param meetingId - 회의 ID
 * @param items - 수정할 자막 배열
 * @returns 배치 수정 결과
 */
export async function updateSubtitlesBatch(
  meetingId: string,
  items: SubtitleBatchItem[]
): Promise<SubtitleBatchResponse> {
  return apiClient<SubtitleBatchResponse>(
    `/api/meetings/${meetingId}/subtitles`,
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    }
  );
}

// =============================================================================
// Global Search API
// =============================================================================

/**
 * 검색 파라미터
 */
export interface SearchParams {
  q: string;
  date_from?: string;
  date_to?: string;
  speaker?: string;
  limit?: number;
  offset?: number;
}

/**
 * 검색 결과 아이템
 */
export interface SearchResultItem {
  subtitle_id: string;
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  text: string;
  start_time: number;
  end_time: number;
  speaker: string | null;
  confidence: number | null;
}

/**
 * 검색 응답
 */
export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

/**
 * 통합 검색
 *
 * @param params - 검색 파라미터
 * @returns 검색 결과
 */
export async function globalSearch(
  params: SearchParams
): Promise<SearchResponse> {
  const searchParams = new URLSearchParams({ q: params.q });
  if (params.date_from) searchParams.set('date_from', params.date_from);
  if (params.date_to) searchParams.set('date_to', params.date_to);
  if (params.speaker) searchParams.set('speaker', params.speaker);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  return apiClient<SearchResponse>(`/api/search?${searchParams.toString()}`);
}

// =============================================================================
// Bills API
// =============================================================================

/**
 * 의안 목록 조회 파라미터
 */
export interface GetBillsParams {
  committee?: string;
  status?: 'received' | 'reviewing' | 'decided' | 'promulgated';
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * 의안 목록 조회
 *
 * @param params - 검색/필터 파라미터
 * @returns 의안 목록 응답
 */
export async function getBills(
  params: GetBillsParams
): Promise<BillsResponse> {
  const searchParams = new URLSearchParams();
  if (params.committee) searchParams.set('committee', params.committee);
  if (params.status) searchParams.set('status', params.status);
  if (params.q) searchParams.set('q', params.q);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  return apiClient<BillsResponse>(`/api/bills?${searchParams.toString()}`);
}

/**
 * 의안 상세 조회 (관련 회의 포함)
 *
 * @param billId - 의안 ID
 * @returns 의안 상세 정보
 */
export async function getBill(billId: string): Promise<BillDetail> {
  return apiClient<BillDetail>(`/api/bills/${billId}`);
}

/**
 * 의안 등록
 *
 * @param data - 의안 생성 데이터
 * @returns 생성된 의안 정보
 */
export async function createBill(
  data: BillCreateData
): Promise<BillDetail> {
  return apiClient<BillDetail>('/api/bills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// =============================================================================
// Phase 6A: Meeting Management Extension
// =============================================================================

export interface MeetingUpdateData {
  title?: string;
  meeting_type?: string;
  committee?: string;
  meeting_date?: string;
}

export async function updateMeeting(
  meetingId: string,
  data: MeetingUpdateData
): Promise<Record<string, unknown>> {
  return apiClient(`/api/meetings/${meetingId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Participants

export async function getParticipants(
  meetingId: string
): Promise<ParticipantType[]> {
  return apiClient<ParticipantType[]>(`/api/meetings/${meetingId}/participants`);
}

export async function addParticipant(
  meetingId: string,
  data: { councilor_id: string; name?: string; role?: string }
): Promise<ParticipantType> {
  return apiClient<ParticipantType>(`/api/meetings/${meetingId}/participants`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeParticipant(
  meetingId: string,
  participantId: string
): Promise<void> {
  await apiClient(`/api/meetings/${meetingId}/participants/${participantId}`, {
    method: 'DELETE',
  });
}

// Agendas

export async function getAgendas(
  meetingId: string
): Promise<AgendaType[]> {
  return apiClient<AgendaType[]>(`/api/meetings/${meetingId}/agendas`);
}

export async function addAgenda(
  meetingId: string,
  data: { order_num: number; title: string; description?: string }
): Promise<AgendaType> {
  return apiClient<AgendaType>(`/api/meetings/${meetingId}/agendas`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgenda(
  meetingId: string,
  agendaId: string,
  data: { order_num?: number; title?: string; description?: string }
): Promise<AgendaType> {
  return apiClient<AgendaType>(`/api/meetings/${meetingId}/agendas/${agendaId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAgenda(
  meetingId: string,
  agendaId: string
): Promise<void> {
  await apiClient(`/api/meetings/${meetingId}/agendas/${agendaId}`, {
    method: 'DELETE',
  });
}

// Subtitle History

export async function getSubtitleHistory(
  meetingId: string,
  subtitleId: string
): Promise<SubtitleHistoryType[]> {
  return apiClient<SubtitleHistoryType[]>(
    `/api/meetings/${meetingId}/subtitles/${subtitleId}/history`
  );
}

// PII Masking

export interface PiiDetectResult {
  items: Array<{
    id: string;
    original_text: string;
    masked_text: string;
    pii_found: Array<{ type: string; original: string; masked: string }>;
  }>;
  total_pii_count: number;
}

export async function detectPii(
  meetingId: string
): Promise<PiiDetectResult> {
  return apiClient<PiiDetectResult>(
    `/api/meetings/${meetingId}/subtitles/detect-pii`,
    { method: 'POST' }
  );
}

export interface PiiApplyResult {
  updated: number;
  items: Array<{
    id: string;
    original_text: string;
    masked_text: string;
    pii_count: number;
  }>;
}

export async function applyPiiMask(
  meetingId: string,
  subtitleIds?: string[]
): Promise<PiiApplyResult> {
  return apiClient<PiiApplyResult>(
    `/api/meetings/${meetingId}/subtitles/apply-pii-mask`,
    {
      method: 'POST',
      body: JSON.stringify(subtitleIds ?? null),
    }
  );
}

// Transcript Status

export async function updateTranscriptStatus(
  meetingId: string,
  transcriptStatus: 'draft' | 'reviewing' | 'final'
): Promise<Record<string, unknown>> {
  return apiClient(`/api/meetings/${meetingId}/transcript-status`, {
    method: 'PATCH',
    body: JSON.stringify({ transcript_status: transcriptStatus }),
  });
}

// Publications

export async function getPublications(
  meetingId: string
): Promise<PublicationType[]> {
  return apiClient<PublicationType[]>(
    `/api/meetings/${meetingId}/publications`
  );
}

export async function createPublication(
  meetingId: string,
  data: { status: string; published_by?: string; notes?: string }
): Promise<PublicationType> {
  return apiClient<PublicationType>(
    `/api/meetings/${meetingId}/publications`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

// =============================================================================
// Phase 6B: Terminology Check + Grammar Check
// =============================================================================

// Terminology

export interface TermIssue {
  subtitle_id: string;
  wrong_term: string;
  correct_term: string;
  category: string | null;
}

export interface TermCheckResult {
  issues: TermIssue[];
  total_issues: number;
}

export async function checkTerminology(
  meetingId: string
): Promise<TermCheckResult> {
  return apiClient<TermCheckResult>(
    `/api/meetings/${meetingId}/subtitles/check-terminology`,
    { method: 'POST' }
  );
}

export interface TermApplyResult {
  updated: number;
  items: Array<{
    id: string;
    original_text: string;
    corrected_text: string;
  }>;
}

export async function applyTerminology(
  meetingId: string
): Promise<TermApplyResult> {
  return apiClient<TermApplyResult>(
    `/api/meetings/${meetingId}/subtitles/apply-terminology`,
    { method: 'POST' }
  );
}

// Grammar Check (AI)

export interface GrammarIssue {
  subtitle_id: string;
  original_text: string;
  corrected_text: string;
  changes: string[];
}

export interface GrammarCheckResult {
  issues: GrammarIssue[];
  total_issues: number;
}

export async function checkGrammar(
  meetingId: string
): Promise<GrammarCheckResult> {
  return apiClient<GrammarCheckResult>(
    `/api/meetings/${meetingId}/subtitles/check-grammar`,
    { method: 'POST' }
  );
}

export async function applyGrammarCorrections(
  meetingId: string,
  corrections: Array<{ subtitle_id: string; corrected_text: string }>
): Promise<{ updated: number }> {
  return apiClient<{ updated: number }>(
    `/api/meetings/${meetingId}/subtitles/apply-grammar`,
    {
      method: 'POST',
      body: JSON.stringify(corrections),
    }
  );
}

// =============================================================================
// Phase 7: Verification (대조관리)
// =============================================================================

/**
 * 대조관리 통계 조회
 *
 * @param meetingId - 회의 ID
 * @returns 검증 통계 정보
 */
export async function getVerificationStats(
  meetingId: string
): Promise<VerificationStatsType> {
  return apiClient<VerificationStatsType>(
    `/api/meetings/${meetingId}/subtitles/verification-stats`
  );
}

/**
 * 검토 대기열 조회
 *
 * @param meetingId - 회의 ID
 * @param params - 필터 파라미터 (신뢰도 임계값, 페이지네이션)
 * @returns 검토 대기 자막 목록
 */
export async function getReviewQueue(
  meetingId: string,
  params?: { confidence_threshold?: number; limit?: number; offset?: number }
): Promise<ReviewQueueResponse> {
  const searchParams = new URLSearchParams();
  if (params?.confidence_threshold !== undefined)
    searchParams.set('confidence_threshold', params.confidence_threshold.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  const qs = searchParams.toString();
  return apiClient<ReviewQueueResponse>(
    `/api/meetings/${meetingId}/subtitles/review-queue${qs ? `?${qs}` : ''}`
  );
}

/**
 * 단건 자막 검증 상태 변경
 *
 * @param meetingId - 회의 ID
 * @param subtitleId - 자막 ID
 * @param status - 검증 상태 ('verified' | 'flagged' | 'unverified')
 * @returns 업데이트된 자막 객체
 */
export async function verifySubtitle(
  meetingId: string,
  subtitleId: string,
  status: 'verified' | 'flagged' | 'unverified'
): Promise<SubtitleType> {
  return apiClient<SubtitleType>(
    `/api/meetings/${meetingId}/subtitles/${subtitleId}/verify`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

/**
 * 배치 자막 검증
 *
 * @param meetingId - 회의 ID
 * @param subtitleIds - 자막 ID 배열
 * @param status - 검증 상태 (기본: 'verified')
 * @returns 배치 검증 결과
 */
export async function batchVerifySubtitles(
  meetingId: string,
  subtitleIds: string[],
  status: 'verified' | 'flagged' = 'verified'
): Promise<{ updated: number; items: SubtitleType[] }> {
  return apiClient(
    `/api/meetings/${meetingId}/subtitles/batch-verify`,
    {
      method: 'POST',
      body: JSON.stringify({ subtitle_ids: subtitleIds, status }),
    }
  );
}

// =============================================================================
// Phase 7: Meeting Summary (AI 요약)
// =============================================================================

/**
 * 회의록 AI 요약 생성
 *
 * @param meetingId - 회의 ID
 * @returns 생성된 요약 정보
 */
export async function generateSummary(
  meetingId: string
): Promise<MeetingSummaryType> {
  return apiClient<MeetingSummaryType>(
    `/api/meetings/${meetingId}/summary`,
    { method: 'POST' }
  );
}

/**
 * 회의록 요약 조회
 *
 * @param meetingId - 회의 ID
 * @returns 요약 정보
 */
export async function getSummary(
  meetingId: string
): Promise<MeetingSummaryType> {
  return apiClient<MeetingSummaryType>(
    `/api/meetings/${meetingId}/summary`
  );
}

/**
 * 회의록 요약 삭제
 *
 * @param meetingId - 회의 ID
 */
export async function deleteSummary(
  meetingId: string
): Promise<void> {
  await apiClient(
    `/api/meetings/${meetingId}/summary`,
    { method: 'DELETE' }
  );
}

export default apiClient;
