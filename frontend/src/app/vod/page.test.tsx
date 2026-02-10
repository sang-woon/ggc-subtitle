import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingType } from '@/types';

import VodListPage from './page';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}));

// Mock useVodList hook
const mockUseVodList = jest.fn();
jest.mock('@/hooks/useVodList', () => ({
  useVodList: (...args: unknown[]) => mockUseVodList(...args),
}));

// Mock Header component
jest.mock('@/components', () => ({
  Header: () => <header data-testid="header">Header</header>,
}));

describe('VodListPage', () => {
  const mockVods: MeetingType[] = [
    {
      id: 'vod-1',
      title: '제122회 본회의',
      meeting_date: '2026-02-04',
      stream_url: null,
      vod_url: 'https://vod.example.com/122',
      status: 'ended',
      duration_seconds: 5400,
      created_at: '2026-02-04T09:00:00Z',
      updated_at: '2026-02-04T11:30:00Z',
    },
    {
      id: 'vod-2',
      title: '제121회 상임위원회',
      meeting_date: '2026-02-03',
      stream_url: null,
      vod_url: 'https://vod.example.com/121',
      status: 'processing',
      duration_seconds: 7200,
      created_at: '2026-02-03T09:00:00Z',
      updated_at: '2026-02-03T11:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVodList.mockReturnValue({
      vods: mockVods,
      isLoading: false,
      error: null,
      totalPages: 2,
      total: 15,
      page: 1,
      perPage: 10,
      hasNext: true,
      mutate: jest.fn(),
    });
  });

  describe('Page Structure', () => {
    it('renders page title', () => {
      render(<VodListPage />);

      expect(screen.getByText('VOD 목록')).toBeInTheDocument();
    });

    it('renders Header component', () => {
      render(<VodListPage />);

      expect(screen.getByTestId('header')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when data is loading', () => {
      mockUseVodList.mockReturnValue({
        vods: [],
        isLoading: true,
        error: null,
        totalPages: 0,
        total: 0,
        page: 1,
        perPage: 10,
        hasNext: false,
        mutate: jest.fn(),
      });

      render(<VodListPage />);

      expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when API fails', () => {
      mockUseVodList.mockReturnValue({
        vods: [],
        isLoading: false,
        error: new Error('Network error'),
        totalPages: 0,
        total: 0,
        page: 1,
        perPage: 10,
        hasNext: false,
        mutate: jest.fn(),
      });

      render(<VodListPage />);

      expect(screen.getByText('데이터를 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument();
    });
  });

  describe('VOD Table Display', () => {
    it('renders VodTable with meeting data', () => {
      render(<VodListPage />);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('제122회 본회의')).toBeInTheDocument();
      expect(screen.getByText('제121회 상임위원회')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('renders pagination when totalPages > 1', () => {
      render(<VodListPage />);

      expect(screen.getByRole('navigation', { name: /페이지네이션/ })).toBeInTheDocument();
    });

    it('does not render pagination when totalPages is 1', () => {
      mockUseVodList.mockReturnValue({
        vods: mockVods,
        isLoading: false,
        error: null,
        totalPages: 1,
        total: 2,
        page: 1,
        perPage: 10,
        hasNext: false,
        mutate: jest.fn(),
      });

      render(<VodListPage />);

      expect(screen.queryByRole('navigation', { name: /페이지네이션/ })).not.toBeInTheDocument();
    });

    it('calls useVodList with updated page when page changes', async () => {
      const user = userEvent.setup();
      render(<VodListPage />);

      const nextButton = screen.getByRole('button', { name: /다음/ });
      await user.click(nextButton);

      await waitFor(() => {
        expect(mockUseVodList).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2 })
        );
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no VODs', () => {
      mockUseVodList.mockReturnValue({
        vods: [],
        isLoading: false,
        error: null,
        totalPages: 0,
        total: 0,
        page: 1,
        perPage: 10,
        hasNext: false,
        mutate: jest.fn(),
      });

      render(<VodListPage />);

      expect(screen.getByText('등록된 VOD가 없습니다')).toBeInTheDocument();
    });
  });
});
