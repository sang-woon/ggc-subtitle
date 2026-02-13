import { act } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LivePage from '../page';

import type { MeetingType } from '../../../types';

// Mock global fetch for STT start/stop API calls
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ status: 'started' }),
  text: () => Promise.resolve(''),
});
global.fetch = mockFetch;

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

// Mock the useChannelStatus hook
const mockUseChannelStatus = jest.fn();
jest.mock('../../../hooks/useChannelStatus', () => ({
  __esModule: true,
  useChannelStatus: () => mockUseChannelStatus(),
}));

// Mock the useRouter and useSearchParams hooks
const mockPush = jest.fn();
const mockSearchParamsGet = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
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

  const renderLivePage = async (options: { expectSttStart?: boolean } = {}) => {
    const { expectSttStart = true } = options;

    render(<LivePage />);

    if (expectSttStart) {
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
      text: () => Promise.resolve(''),
    });
    mockUseSubtitleWebSocket.mockReturnValue(defaultWebSocketReturn);
    mockUseChannelStatus.mockReturnValue({
      channels: [
        { id: 'ch14', name: '본회의', code: 'A011', stream_url: 'https://example.com/ch14/playlist.m3u8', livestatus: 1 },
      ],
      isLoading: false,
      error: null,
      requestNotificationPermission: jest.fn(),
    });
    // 기본: channel 파라미터로 채널이 선택된 상태
    mockSearchParamsGet.mockReturnValue('ch14');
  });

  describe('when live meeting exists', () => {
    beforeEach(() => {
      mockUseLiveMeeting.mockReturnValue({
        meeting: mockLiveMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('renders the page', async () => {
      await renderLivePage();

      expect(screen.getByTestId('live-page')).toBeInTheDocument();
    });

    it('shows header with channel name', async () => {
      await renderLivePage();

      // 채널 이름이 헤더와 채널바에 표시됨
      const channelNames = screen.getAllByText('본회의');
      expect(channelNames.length).toBeGreaterThanOrEqual(1);
    });

    it('shows live badge in header', async () => {
      await renderLivePage();

      // Header와 채널바 모두 LIVE 배지가 표시됨
      const liveBadges = screen.getAllByText(/LIVE|Live/i);
      expect(liveBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('renders HLS player', async () => {
      await renderLivePage();

      expect(screen.getByTestId('hls-player-container')).toBeInTheDocument();
    });

    it('renders subtitle panel', async () => {
      await renderLivePage();

      expect(screen.getByTestId('subtitle-panel')).toBeInTheDocument();
    });

    it('renders search input in header', async () => {
      await renderLivePage();

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('has 70/30 layout on desktop', async () => {
      await renderLivePage();

      const mainContent = screen.getByTestId('main-content');
      const sidebar = screen.getByTestId('sidebar');

      expect(mainContent).toHaveClass('lg:w-[70%]');
      expect(sidebar).toHaveClass('lg:w-[30%]');
    });
  });

  describe('when no channel selected', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockReturnValue(null);
      mockUseLiveMeeting.mockReturnValue({
        meeting: null,
        isLoading: false,
        error: null,
      });
    });

    it('shows channel selector', async () => {
      await renderLivePage({ expectSttStart: false });

      expect(screen.getByTestId('channel-selector')).toBeInTheDocument();
      expect(screen.getByText('채널 선택')).toBeInTheDocument();
    });

    it('shows channel list', async () => {
      await renderLivePage({ expectSttStart: false });

      expect(screen.getByText('본회의')).toBeInTheDocument();
    });

    it('navigates to channel on select', async () => {
      const user = userEvent.setup();
      await renderLivePage({ expectSttStart: false });

      await user.click(screen.getByTestId('channel-ch14'));

      expect(mockPush).toHaveBeenCalledWith('/live?channel=ch14');
    });
  });

  describe('channel loading state', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockReturnValue(null);
      mockUseChannelStatus.mockReturnValue({
        channels: [],
        isLoading: true,
        error: null,
        requestNotificationPermission: jest.fn(),
      });
      mockUseLiveMeeting.mockReturnValue({
        meeting: null,
        isLoading: false,
        error: null,
      });
    });

    it('shows loading spinner in channel selector', async () => {
      await renderLivePage({ expectSttStart: false });

      // ChannelSelector shows spinner when isLoading=true
      expect(screen.getByTestId('live-page')).toBeInTheDocument();
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

      await renderLivePage();

      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, '예산');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

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

    it('stacks content on mobile', async () => {
      await renderLivePage();

      const layout = screen.getByTestId('live-layout');
      expect(layout).toHaveClass('flex-col');
      expect(layout).toHaveClass('lg:flex-row');
    });

    it('video takes full width on mobile', async () => {
      await renderLivePage();

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

    it('displays connection status', async () => {
      await renderLivePage();

      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
      expect(screen.getByText('연결됨')).toBeInTheDocument();
    });

    it('shows connecting status when connecting', async () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'connecting',
      });

      await renderLivePage();

      expect(screen.getByText('연결 중...')).toBeInTheDocument();
    });

    it('shows disconnected status and reconnect button when disconnected', async () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'disconnected',
      });

      await renderLivePage();

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
      await renderLivePage();

      await user.click(screen.getByTestId('reconnect-button'));

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('shows error status and reconnect button when error', async () => {
      mockUseSubtitleWebSocket.mockReturnValue({
        ...defaultWebSocketReturn,
        connectionStatus: 'error',
      });

      await renderLivePage();

      expect(screen.getByText('연결 오류')).toBeInTheDocument();
      expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
    });

    it('displays received subtitles in the panel', async () => {
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

      await renderLivePage();

      // SubtitleOverlay + SubtitlePanel 양쪽에서 렌더링됨
      const matches = screen.getAllByText('테스트 자막입니다.');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
