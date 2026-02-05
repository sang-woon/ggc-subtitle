import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LivePage from '../page';

import type { MeetingType } from '../../../types';

// Mock the useLiveMeeting hook
const mockUseLiveMeeting = jest.fn();
jest.mock('../../../hooks/useLiveMeeting', () => ({
  __esModule: true,
  default: () => mockUseLiveMeeting(),
}));

// Mock the useSubtitleWebSocket hook
const mockUseSubtitleWebSocket = jest.fn();
jest.mock('../../../hooks/useSubtitleWebSocket', () => ({
  __esModule: true,
  useSubtitleWebSocket: () => mockUseSubtitleWebSocket(),
}));

// Mock the useRouter hook
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock HLS.js
jest.mock('hls.js', () => {
  const Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    ERROR: 'hlsError',
  } as const;

  const ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  } as const;

  return {
    __esModule: true,
    default: class MockHls {
      static isSupported() {
        return true;
      }
      static Events = Events;
      static ErrorTypes = ErrorTypes;
      attachMedia = jest.fn();
      loadSource = jest.fn();
      destroy = jest.fn();
      on = jest.fn();
    },
  };
});

describe('LivePage', () => {
  const mockLiveMeeting: MeetingType = {
    id: 'meeting-1',
    title: '제352회 본회의',
    meeting_date: '2024-01-15T10:00:00Z',
    stream_url: 'https://example.com/stream.m3u8',
    vod_url: null,
    status: 'live',
    duration_seconds: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  };

  const defaultWebSocketReturn = {
    subtitles: [],
    connectionStatus: 'connected' as const,
    connect: jest.fn(),
    disconnect: jest.fn(),
    clearSubtitles: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubtitleWebSocket.mockReturnValue(defaultWebSocketReturn);
  });

  describe('when live meeting exists', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: mockLiveMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('renders the page', () => {
      render(<LivePage />);

      expect(screen.getByTestId('live-page')).toBeInTheDocument();
    });

    it('shows header with meeting title', () => {
      render(<LivePage />);

      expect(screen.getByText('제352회 본회의')).toBeInTheDocument();
    });

    it('shows live badge in header', () => {
      render(<LivePage />);

      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('renders HLS player', () => {
      render(<LivePage />);

      expect(screen.getByTestId('hls-player-container')).toBeInTheDocument();
    });

    it('renders subtitle panel', () => {
      render(<LivePage />);

      expect(screen.getByTestId('subtitle-panel')).toBeInTheDocument();
    });

    it('renders search input in header', () => {
      render(<LivePage />);

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('has 70/30 layout on desktop', () => {
      render(<LivePage />);

      const mainContent = screen.getByTestId('main-content');
      const sidebar = screen.getByTestId('sidebar');

      expect(mainContent).toHaveClass('lg:w-[70%]');
      expect(sidebar).toHaveClass('lg:w-[30%]');
    });
  });

  describe('when no live meeting', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: null,
        isLoading: false,
        error: null,
      });
    });

    it('shows no broadcast message', () => {
      render(<LivePage />);

      expect(screen.getByText(/현재 진행 중인 방송이 없습니다/)).toBeInTheDocument();
    });

    it('shows home button', () => {
      render(<LivePage />);

      expect(screen.getByRole('button', { name: /홈으로 이동/ })).toBeInTheDocument();
    });

    it('navigates to home when button is clicked', async () => {
      const user = userEvent.setup();
      render(<LivePage />);

      await user.click(screen.getByRole('button', { name: /홈으로 이동/ }));

      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  describe('loading state', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: null,
        isLoading: true,
        error: null,
      });
    });

    it('shows loading state', () => {
      render(<LivePage />);

      expect(screen.getByTestId('page-loading')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: null,
        isLoading: false,
        error: new Error('Failed to fetch'),
      });
    });

    it('shows error message', () => {
      render(<LivePage />);

      expect(screen.getByText(/오류가 발생했습니다/)).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: mockLiveMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('updates search query when typing in search input', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<LivePage />);

      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, '예산');

      jest.advanceTimersByTime(300);

      // The subtitle panel should receive the search query
      // This is tested via integration - the searchQuery prop is passed to SubtitlePanel
      expect(searchInput).toHaveValue('예산');

      jest.useRealTimers();
    });
  });

  describe('responsive layout', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: mockLiveMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('stacks content on mobile', () => {
      render(<LivePage />);

      const layout = screen.getByTestId('live-layout');
      expect(layout).toHaveClass('flex-col');
      expect(layout).toHaveClass('lg:flex-row');
    });

    it('video takes full width on mobile', () => {
      render(<LivePage />);

      const mainContent = screen.getByTestId('main-content');
      expect(mainContent).toHaveClass('w-full');
    });
  });

  describe('WebSocket subtitle integration', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: mockLiveMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('displays connection status', () => {
      render(<LivePage />);

      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
      expect(screen.getByText('연결됨')).toBeInTheDocument();
    });

    it('shows connecting status when connecting', () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'connecting',
      });

      render(<LivePage />);

      expect(screen.getByText('연결 중...')).toBeInTheDocument();
    });

    it('shows disconnected status and reconnect button when disconnected', () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'disconnected',
      });

      render(<LivePage />);

      expect(screen.getByText('연결 끊김')).toBeInTheDocument();
      expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
    });

    it('calls connect when reconnect button is clicked', async () => {
      const mockConnect = jest.fn();
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'disconnected',
        connect: mockConnect,
      });

      const user = userEvent.setup();
      render(<LivePage />);

      await user.click(screen.getByTestId('reconnect-button'));

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('shows error status and reconnect button when error', () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'error',
      });

      render(<LivePage />);

      expect(screen.getByText('연결 오류')).toBeInTheDocument();
      expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
    });

    it('displays received subtitles in the panel', () => {
      const mockSubtitles = [
        {
          id: 'sub-1',
          meeting_id: 'meeting-1',
          start_time: 0,
          end_time: 5,
          text: '테스트 자막입니다.',
          speaker: null,
          confidence: 0.9,
          created_at: '2024-01-15T10:00:00Z',
        },
      ];

      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        subtitles: mockSubtitles,
      });

      render(<LivePage />);

      expect(screen.getByText('테스트 자막입니다.')).toBeInTheDocument();
    });
  });
});
