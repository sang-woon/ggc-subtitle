// 공통 타입 정의

export interface MeetingType {
  id: string;
  title: string;
  meeting_date: string;
  stream_url: string | null;
  vod_url: string | null;
  status: 'scheduled' | 'live' | 'processing' | 'ended';
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface SubtitleType {
  id: string;
  meeting_id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker: string | null;
  confidence: number | null;
  created_at: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface ChannelType {
  id: string;
  name: string;
  code: string;
  stream_url: string;
  livestatus?: number;     // 0=방송전, 1=방송중, 2=정회중, 3=종료, 4=생중계없음
  status_text?: string;    // "방송중", "방송전" 등
  has_schedule?: boolean;  // 오늘 일정 유무
  session_no?: number;     // 회차 (예: 388 → 제388회)
  session_order?: number;  // 차수 (예: 1 → 제1차)
}

export interface VodRegisterFormType {
  title: string;
  meeting_date: string;
  vod_url: string;
}

// 회의록 (자막 수 포함)
export interface MeetingNoteType extends MeetingType {
  subtitle_count: number;
}

// 통합 검색 결과 - 자막 항목
export interface SearchSubtitleType {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker: string | null;
  confidence: number | null;
}

// 통합 검색 결과 - 회의별 그룹
export interface SearchGroupType {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string | null;
  meeting_status: string | null;
  vod_url: string | null;
  subtitles: SearchSubtitleType[];
}

// 통합 검색 응답
export interface GlobalSearchResponse {
  items: SubtitleType[];
  grouped: SearchGroupType[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

// 회의록 목록 응답
export interface MeetingNotesResponse {
  items: MeetingNoteType[];
  total: number;
  limit: number;
  offset: number;
}
