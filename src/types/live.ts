/**
 * 경기도의회 생중계 채널 타입
 */
export interface LiveChannel {
  /** 위원회 이름 (본회의, 기획재정위원회 등) */
  name: string;
  /** 위원회 코드 (data-code) */
  code: string;
  /** 채널 코드 (data-ch: ggc1 등) */
  ch: string;
  /** 스트림 서버 IP */
  ip: string;
  /** 방송 상태 */
  status: 'live' | 'upcoming' | 'off';
  /** 상태 텍스트 (방송중, 방송전, 생중계없음) */
  statusText: string;
  /** HLS 스트림 URL (방송중일 때만) */
  streamUrl?: string;
}

export interface LiveStatusResponse {
  channels: LiveChannel[];
  lastUpdated: string;
  error?: string;
}
