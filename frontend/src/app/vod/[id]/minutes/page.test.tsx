import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MinutesPage from './page';

import type { MeetingSummaryType, MeetingType, SubtitleType } from '../../../../types';

const mockPush = jest.fn();
const mockSetTitle = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

jest.mock('../../../../contexts/BreadcrumbContext', () => ({
  useBreadcrumb: () => ({
    dynamicTitle: null,
    setTitle: mockSetTitle,
  }),
}));

const mockApiClient = jest.fn();

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  apiClient: (...args: unknown[]) => mockApiClient(...args),
  API_BASE_URL: 'http://localhost:8000',
}));

const defaultParams = { id: 'meeting-1' };

const mockMeeting: MeetingType = {
  id: 'meeting-1',
  title: '제1회 테스트 회의',
  meeting_date: '2024-01-01T00:00:00Z',
  stream_url: null,
  vod_url: 'https://example.com/vod.mp4',
  status: 'ended',
  duration_seconds: 3600,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockSubtitles: SubtitleType[] = [
  {
    id: 'subtitle-1',
    meeting_id: 'meeting-1',
    start_time: 0,
    end_time: 3,
    text: '안녕하세요.',
    speaker: '화자 1',
    confidence: 0.95,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'subtitle-2',
    meeting_id: 'meeting-1',
    start_time: 3,
    end_time: 6,
    text: '오늘 회의를 시작하겠습니다.',
    speaker: '화자 1',
    confidence: 0.92,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'subtitle-3',
    meeting_id: 'meeting-1',
    start_time: 6,
    end_time: 10,
    text: '좋습니다.',
    speaker: '화자 2',
    confidence: 0.88,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockSummary: MeetingSummaryType = {
  id: 'summary-1',
  meeting_id: 'meeting-1',
  summary_text: '테스트 회의 요약입니다.',
  agenda_summaries: [
    { order_num: 1, title: '안건 1', summary: '안건 1 요약' },
    { order_num: 2, title: '안건 2', summary: '안건 2 요약' },
  ],
  key_decisions: ['결정 1', '결정 2'],
  action_items: ['조치 1'],
  model_used: 'gpt-4o-mini',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function setupMocks(options?: { noSummary?: boolean; noSubtitles?: boolean }) {
  mockApiClient.mockImplementation((url: string) => {
    if (url.includes('/subtitles')) {
      return Promise.resolve({ items: options?.noSubtitles ? [] : mockSubtitles });
    }
    if (url.includes('/summary')) {
      if (options?.noSummary) {
        return Promise.reject(new Error('Not found'));
      }
      return Promise.resolve(mockSummary);
    }
    return Promise.resolve(mockMeeting);
  });
}

describe('MinutesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockApiClient.mockReturnValue(new Promise(() => {}));
    render(<MinutesPage params={defaultParams} />);
    expect(screen.getByTestId('page-loading')).toBeInTheDocument();
  });

  it('renders minutes page with subtitle data', async () => {
    setupMocks({ noSummary: true });
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('minutes-page')).toBeInTheDocument();
    });

    expect(screen.getByText('제1회 테스트 회의')).toBeInTheDocument();
    expect(screen.getByText('화자 1')).toBeInTheDocument();
    expect(screen.getByText('화자 2')).toBeInTheDocument();
  });

  it('groups consecutive same-speaker subtitles', async () => {
    setupMocks({ noSummary: true });
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('minutes-content')).toBeInTheDocument();
    });

    // 화자 1의 두 자막이 합쳐져야 함
    expect(screen.getByText('안녕하세요. 오늘 회의를 시작하겠습니다.')).toBeInTheDocument();
  });

  it('shows empty state when no subtitles', async () => {
    setupMocks({ noSummary: true, noSubtitles: true });
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByText('자막 데이터가 없습니다. STT를 먼저 실행해주세요.')).toBeInTheDocument();
    });
  });

  it('switches to summary tab', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('minutes-page')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tab-summary'));
    expect(screen.getByTestId('summary-content')).toBeInTheDocument();
    expect(screen.getByText('테스트 회의 요약입니다.')).toBeInTheDocument();
  });

  it('switches to agenda tab and shows agenda summaries', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('minutes-page')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tab-agenda'));
    expect(screen.getByTestId('agenda-content')).toBeInTheDocument();
    expect(screen.getByText('1. 안건 1')).toBeInTheDocument();
    expect(screen.getByText('2. 안건 2')).toBeInTheDocument();
  });

  it('renders AI summary generation button', async () => {
    setupMocks({ noSummary: true });
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-summary-button')).toBeInTheDocument();
    });
  });

  it('renders PDF export button', async () => {
    setupMocks({ noSummary: true });
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('export-pdf-button')).toBeInTheDocument();
    });
  });

  it('shows error state on API failure', async () => {
    mockApiClient.mockRejectedValue(new Error('Network error'));
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('page-error')).toBeInTheDocument();
    });
  });

  it('shows key decisions and action items in summary', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<MinutesPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByTestId('minutes-page')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tab-summary'));
    expect(screen.getByText('결정 1')).toBeInTheDocument();
    expect(screen.getByText('조치 1')).toBeInTheDocument();
  });
});
