export const SIDEBAR_WIDTH = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const HEADER_HEIGHT = 48;

export interface NavSubItem {
  id: string;
  label: string;
  href?: string;
  /** 회의 컨텍스트 필요 여부 (true면 /vod/[id]가 있어야 활성) */
  requiresMeeting?: boolean;
  /** 회의 ID 기반 동적 경로 생성 함수 */
  getHref?: (meetingId: string) => string;
}

export interface NavModule {
  id: string;
  label: string;
  icon: string; // SVG path or icon identifier
  items: NavSubItem[];
  /** 회의 컨텍스트 필요 여부 */
  requiresMeeting?: boolean;
  /** 메뉴 구분선 위에 표시 */
  dividerBefore?: boolean;
}

export const NAV_MODULES: NavModule[] = [
  {
    id: 'meeting-mgmt',
    label: '회의관리',
    icon: 'calendar',
    items: [
      { id: 'dashboard', label: '대시보드', href: '/' },
      { id: 'live', label: '실시간 방송', href: '/live' },
      { id: 'vod-list', label: '회의 목록', href: '/vod' },
    ],
  },
  {
    id: 'transcript',
    label: '회의록작성',
    icon: 'document-text',
    requiresMeeting: true,
    items: [
      {
        id: 'vod-detail',
        label: 'VOD 상세·STT',
        requiresMeeting: true,
        getHref: (meetingId) => `/vod/${meetingId}`,
      },
      {
        id: 'minutes',
        label: '회의록 작성',
        requiresMeeting: true,
        getHref: (meetingId) => `/vod/${meetingId}/minutes`,
      },
    ],
  },
  {
    id: 'speaker',
    label: '화자관리',
    icon: 'user-group',
    requiresMeeting: true,
    items: [
      {
        id: 'speaker-edit',
        label: '화자 식별',
        requiresMeeting: true,
        getHref: (meetingId) => `/vod/${meetingId}/speaker`,
      },
    ],
  },
  {
    id: 'verification',
    label: '대조관리',
    icon: 'check-badge',
    requiresMeeting: true,
    items: [
      {
        id: 'verify',
        label: '자막 검증',
        requiresMeeting: true,
        getHref: (meetingId) => `/vod/${meetingId}/verify`,
      },
    ],
  },
  {
    id: 'proofreading',
    label: '교정/편집관리',
    icon: 'pencil-square',
    requiresMeeting: true,
    items: [
      {
        id: 'edit',
        label: '자막 교정',
        requiresMeeting: true,
        getHref: (meetingId) => `/vod/${meetingId}/edit`,
      },
    ],
  },
  {
    id: 'bills',
    label: '의안관리',
    icon: 'clipboard-document-list',
    dividerBefore: true,
    items: [
      { id: 'bills-list', label: '의안 목록', href: '/bills' },
    ],
  },
  {
    id: 'search',
    label: '통합검색',
    icon: 'magnifying-glass',
    items: [
      { id: 'search-page', label: '검색', href: '/search' },
    ],
  },
  {
    id: 'system',
    label: '시스템관리',
    icon: 'cog-6-tooth',
    items: [
      { id: 'admin', label: '관리자', href: '/admin' },
    ],
  },
];

/**
 * pathname → 브레드크럼 정적 매핑
 */
export const BREADCRUMB_MAP: Record<string, string[]> = {
  '/': ['회의관리', '대시보드'],
  '/live': ['회의관리', '실시간 방송'],
  '/vod': ['회의관리', '회의 목록'],
  '/bills': ['의안관리', '의안 목록'],
  '/search': ['통합검색', '검색'],
  '/admin': ['시스템관리', '관리자'],
};

/**
 * URL 경로에서 회의 ID를 추출 (/vod/[id], /vod/[id]/edit, /vod/[id]/verify)
 */
export function extractMeetingIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/vod\/([^/]+)/);
  return match?.[1] ?? null;
}
