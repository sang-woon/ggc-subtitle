// 자막 관련 타입

export interface VideoSession {
  id: string;
  kmsUrl: string;
  midx: number;
  title?: string;
  startedAt: Date;
  endedAt?: Date;
  isLive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subtitle {
  id: string;
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  confidence?: number;
  seq?: number;
  speaker?: number | null; // 화자 번호 (0, 1, 2, ...)
  isFinal?: boolean;
  isEdited?: boolean;
  originalText?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SubtitleEdit {
  id: string;
  subtitleId: string;
  oldText: string;
  newText: string;
  editedBy?: string;
  createdAt: Date;
}

// API 요청/응답 타입

export interface CreateSessionRequest {
  kmsUrl: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  hlsUrl: string;
  rtzrToken: string;
}

export interface SaveSubtitleRequest {
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  confidence?: number;
  seq?: number;
}

export interface SearchSubtitlesParams {
  q: string;
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface SearchSubtitleResult {
  id: string;
  sessionId: string;
  text: string;
  startTimeMs: number;
  highlightedText: string;
  session?: {
    title?: string;
    kmsUrl: string;
    startedAt: Date;
  };
}

export interface UpdateSubtitleRequest {
  text: string;
}

// RTZR 관련 타입

export interface RtzrAuthResponse {
  access_token: string;
  expire_at: number;
}

export interface RtzrTranscriptResult {
  seq: number;
  start_at: number;
  duration: number;
  final: boolean;
  alternatives: {
    text: string;
    confidence: number;
    words?: {
      text: string;
      start_at: number;
      duration: number;
    }[];
  }[];
}
