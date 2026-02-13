import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SpeakerManagementPage from './page';

import type { MeetingType, SubtitleType } from '../../../../types';

const mockPush = jest.fn();
const mockSetTitle = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('../../../../contexts/BreadcrumbContext', () => ({
  useBreadcrumb: () => ({
    dynamicTitle: null,
    setTitle: mockSetTitle,
  }),
}));

const mockApiClient = jest.fn();
const mockUpdateSubtitlesBatch = jest.fn();
const mockScrollIntoView = jest.fn();
const originalScrollIntoView = (window.HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  apiClient: (...args: unknown[]) => mockApiClient(...args),
  updateSubtitlesBatch: (...args: unknown[]) => mockUpdateSubtitlesBatch(...args),
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
    text: '첫 번째 발언',
    speaker: null,
    confidence: 0.91,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'subtitle-2',
    meeting_id: 'meeting-1',
    start_time: 3,
    end_time: 6,
    text: '두 번째 발언',
    speaker: '의장',
    confidence: 0.87,
    created_at: '2024-01-01T00:00:03Z',
  },
];

describe('SpeakerManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScrollIntoView.mockClear();

    // JSDOM에서 scrollIntoView 미지원으로 인한 테스트 오류를 방지하기 위한 더미 폴백
    Object.defineProperty(window.HTMLElement.prototype as { scrollIntoView: () => void }, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: mockScrollIntoView,
    });

    mockApiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/meetings/meeting-1') {
        return Promise.resolve(mockMeeting);
      }

      if (endpoint === '/api/meetings/meeting-1/subtitles?limit=1000') {
        return Promise.resolve({ items: mockSubtitles });
      }

      return Promise.reject(new Error('Unknown endpoint'));
    });

    mockUpdateSubtitlesBatch.mockResolvedValue({ updated: 0, items: [] });
  });

  afterEach(() => {
    Object.defineProperty(window.HTMLElement.prototype as { scrollIntoView: unknown }, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: originalScrollIntoView,
    });
  });

  it('renders meeting title and subtitle list after loading', async () => {
    render(<SpeakerManagementPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByText('제1회 테스트 회의')).toBeInTheDocument();
      expect(screen.getByText('첫 번째 발언')).toBeInTheDocument();
      expect(screen.getByText('두 번째 발언')).toBeInTheDocument();
    });
  });

  it('saves speaker changes as batch update payload', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<SpeakerManagementPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByText('첫 번째 발언')).toBeInTheDocument();
    });

    const speakerInputs = screen.getAllByRole('combobox');
    expect(speakerInputs.length).toBeGreaterThan(0);
    const firstSubtitleSpeakerSelect = speakerInputs[speakerInputs.length - 2];
    if (!firstSubtitleSpeakerSelect) {
      throw new Error('Expected subtitle speaker select element to exist.');
    }
    await user.selectOptions(firstSubtitleSpeakerSelect, '화자 1');

    const saveButton = screen.getByRole('button', { name: /변경 저장/i });
    await user.click(saveButton);

    expect(mockUpdateSubtitlesBatch).toHaveBeenCalledWith('meeting-1', [
      {
        id: 'subtitle-1',
        speaker: '화자 1',
      },
    ]);

    expect(alertMock).toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it('shows navigation links for correction and verification', async () => {
    render(<SpeakerManagementPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '교정/편집으로 이동' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '돌아가기' })).toBeInTheDocument();
    });
  });

  it('shows error message when loading fails', async () => {
    mockApiClient.mockRejectedValue(new Error('Network error'));

    render(<SpeakerManagementPage params={defaultParams} />);

    await waitFor(() => {
      expect(screen.getByText('회의 정보를 불러오지 못했습니다.')).toBeInTheDocument();
    });
  });
});
