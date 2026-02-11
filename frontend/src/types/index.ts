// 공통 타입 정의

export interface MeetingType {
  id: string;
  title: string;
  meeting_date: string;
  stream_url: string | null;
  vod_url: string | null;
  status: 'scheduled' | 'live' | 'processing' | 'ended';
  duration_seconds: number | null;
  meeting_type: string | null;
  committee: string | null;
  transcript_status: 'draft' | 'reviewing' | 'final';
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

// Bills types
export interface BillItem {
  id: string;
  bill_number: string;
  title: string;
  proposer: string | null;
  committee: string | null;
  status: 'received' | 'reviewing' | 'decided' | 'promulgated';
  proposed_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillMention {
  id: string;
  bill_id: string;
  meeting_id: string;
  subtitle_id: string | null;
  start_time: number | null;
  end_time: number | null;
  note: string | null;
  meeting_title?: string;
  meeting_date?: string;
  created_at: string;
}

export interface BillDetail extends BillItem {
  mentions: BillMention[];
}

export interface BillsResponse {
  items: BillItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface BillCreateData {
  bill_number: string;
  title: string;
  proposer?: string;
  committee?: string;
  status?: 'received' | 'reviewing' | 'decided' | 'promulgated';
  proposed_date?: string;
}

// Phase 6A types

export interface ParticipantType {
  id: string;
  meeting_id: string;
  councilor_id: string;
  name: string | null;
  role: string | null;
  created_at: string | null;
}

export interface AgendaType {
  id: string;
  meeting_id: string;
  order_num: number;
  title: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubtitleHistoryType {
  id: string;
  subtitle_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface PublicationType {
  id: string;
  meeting_id: string;
  status: 'draft' | 'reviewing' | 'final';
  published_by: string | null;
  notes: string | null;
  created_at: string;
}
