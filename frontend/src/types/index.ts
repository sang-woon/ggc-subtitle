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
  url: string;
}
