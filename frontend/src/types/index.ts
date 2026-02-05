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

export interface VodRegisterFormType {
  title: string;
  meeting_date: string;
  vod_url: string;
}
