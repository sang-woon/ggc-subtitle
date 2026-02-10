import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VodViewerPage from './page';

import type { MeetingType, SubtitleType } from '../../../types';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}));

// Mock the apiClient
const mockApiClient = jest.fn();
jest.mock('../../../lib/api', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockApiClient(...args),
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

describe('VodViewerPage', () => {
  const mockMeeting: MeetingType = {
    id: 'vod-1',
    title: '제352회 본회의',
    meeting_date: '2024-01-15T10:00:00Z',
    stream_url: null,
    vod_url: 'https://example.com/video.mp4',
    status: 'ended',
    duration_seconds: 5400,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  };

  const mockSubtitles: SubtitleType[] = [
    {
      id: 'sub-1',
      meeting_id: 'vod-1',
      start_time: 0,
      end_time: 5,
      text: '안녕하세요, 회의를 시작하겠습니다.',
      speaker: '의장',
      confidence: 0.95,
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 'sub-2',
      meeting_id: 'vod-1',
      start_time: 5,
      end_time: 10,
      text: '첫 번째 안건을 상정합니다.',
      speaker: '의장',
      confidence: 0.92,
      created_at: '2024-01-15T10:00:05Z',
    },
  ];

  const defaultParams = { id: 'vod-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/meetings/vod-1') {
        return Promise.resolve(mockMeeting);
      }
      if (endpoint === '/api/meetings/vod-1/subtitles') {
        return Promise.resolve(mockSubtitles);
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  describe('page structure', () => {
    it('renders the VOD viewer page', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByTestId('vod-viewer-page')).toBeInTheDocument();
      });
    });

    it('shows header with meeting title after loading', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByText('제352회 본회의')).toBeInTheDocument();
      });
    });

    it('shows VOD badge in header', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByText('VOD')).toBeInTheDocument();
      });
    });
  });

  describe('layout', () => {
    it('has 70/30 layout on desktop', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        const mainContent = screen.getByTestId('main-content');
        const sidebar = screen.getByTestId('sidebar');

        expect(mainContent).toHaveClass('lg:w-[70%]');
        expect(sidebar).toHaveClass('lg:w-[30%]');
      });
    });

    it('stacks content on mobile', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        const layout = screen.getByTestId('vod-layout');
        expect(layout).toHaveClass('flex-col');
        expect(layout).toHaveClass('lg:flex-row');
      });
    });
  });

  describe('video player', () => {
    it('renders Mp4Player', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByTestId('mp4-player-container')).toBeInTheDocument();
      });
    });

    it('renders VideoControls', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByTestId('video-controls')).toBeInTheDocument();
      });
    });
  });

  describe('subtitle panel', () => {
    it('renders SubtitlePanel', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-panel')).toBeInTheDocument();
      });
    });

    it('displays subtitles after loading', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByText('안녕하세요, 회의를 시작하겠습니다.')).toBeInTheDocument();
        expect(screen.getByText('첫 번째 안건을 상정합니다.')).toBeInTheDocument();
      });
    });
  });

  describe('API calls', () => {
    it('fetches meeting data with correct id', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledWith('/api/meetings/vod-1');
      });
    });

    it('fetches subtitles with correct meeting id', async () => {
      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledWith('/api/meetings/vod-1/subtitles');
      });
    });
  });

  describe('loading state', () => {
    it('shows loading indicator while fetching data', () => {
      mockApiClient.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<VodViewerPage params={defaultParams} />);

      expect(screen.getByTestId('page-loading')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when API call fails', async () => {
      mockApiClient.mockRejectedValue(new Error('Network error'));

      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByTestId('page-error')).toBeInTheDocument();
      });
    });

    it('shows home navigation button on error', async () => {
      mockApiClient.mockRejectedValue(new Error('Network error'));

      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /홈으로 이동/ })).toBeInTheDocument();
      });
    });

    it('navigates to home when home button is clicked on error', async () => {
      mockApiClient.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();

      render(<VodViewerPage params={defaultParams} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /홈으로 이동/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /홈으로 이동/ }));

      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
});
