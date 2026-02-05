import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingType } from '@/types';

import VodTable from '../VodTable';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('VodTable', () => {
  const mockVodList: MeetingType[] = [
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
    {
      id: 'vod-3',
      title: '제120회 예산결산위원회',
      meeting_date: '2026-02-02',
      stream_url: null,
      vod_url: 'https://vod.example.com/120',
      status: 'ended',
      duration_seconds: 9000,
      created_at: '2026-02-02T09:00:00Z',
      updated_at: '2026-02-02T11:30:00Z',
    },
  ];

  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('Table Rendering', () => {
    it('renders table with headers', () => {
      render(<VodTable vods={mockVodList} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('제목')).toBeInTheDocument();
      expect(screen.getByText('날짜')).toBeInTheDocument();
      expect(screen.getByText('재생시간')).toBeInTheDocument();
      expect(screen.getByText('상태')).toBeInTheDocument();
    });

    it('renders all VOD items as table rows', () => {
      render(<VodTable vods={mockVodList} />);

      expect(screen.getByText('제122회 본회의')).toBeInTheDocument();
      expect(screen.getByText('제121회 상임위원회')).toBeInTheDocument();
      expect(screen.getByText('제120회 예산결산위원회')).toBeInTheDocument();
    });

    it('displays meeting date for each row', () => {
      render(<VodTable vods={mockVodList} />);

      expect(screen.getByText(/2026년 2월 4일/)).toBeInTheDocument();
      expect(screen.getByText(/2026년 2월 3일/)).toBeInTheDocument();
      expect(screen.getByText(/2026년 2월 2일/)).toBeInTheDocument();
    });

    it('displays duration in HH:MM:SS format', () => {
      render(<VodTable vods={mockVodList} />);

      // 5400 seconds = 1:30:00
      expect(screen.getByText('1:30:00')).toBeInTheDocument();
      // 7200 seconds = 2:00:00
      expect(screen.getByText('2:00:00')).toBeInTheDocument();
      // 9000 seconds = 2:30:00
      expect(screen.getByText('2:30:00')).toBeInTheDocument();
    });

    it('displays "-" for null duration', () => {
      const vodWithNullDuration: MeetingType[] = [
        {
          ...mockVodList[0],
          duration_seconds: null,
        },
      ];
      render(<VodTable vods={vodWithNullDuration} />);

      const durationCell = screen.getByText('-');
      expect(durationCell).toBeInTheDocument();
    });
  });

  describe('Status Badge Display', () => {
    it('displays success badge for ended status', () => {
      render(<VodTable vods={mockVodList} />);

      const completedBadges = screen.getAllByText('자막 완료');
      expect(completedBadges.length).toBe(2); // vod-1 and vod-3
    });

    it('displays warning badge for processing status', () => {
      render(<VodTable vods={mockVodList} />);

      expect(screen.getByText('자막 생성중')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays empty message when no VODs', () => {
      render(<VodTable vods={[]} />);

      expect(screen.getByText('등록된 VOD가 없습니다')).toBeInTheDocument();
    });

    it('does not render table when empty', () => {
      render(<VodTable vods={[]} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Row Click Navigation', () => {
    it('navigates to /vod/:id when row is clicked', async () => {
      const user = userEvent.setup();
      render(<VodTable vods={mockVodList} />);

      const firstRow = screen.getByText('제122회 본회의').closest('tr');
      expect(firstRow).toBeInTheDocument();
      await user.click(firstRow!);

      expect(mockPush).toHaveBeenCalledWith('/vod/vod-1');
    });

    it('navigates to correct VOD when different rows are clicked', async () => {
      const user = userEvent.setup();
      render(<VodTable vods={mockVodList} />);

      const secondRow = screen.getByText('제121회 상임위원회').closest('tr');
      await user.click(secondRow!);

      expect(mockPush).toHaveBeenCalledWith('/vod/vod-2');
    });
  });

  describe('Responsive - Mobile Card View', () => {
    it('renders mobile card view on small screens', () => {
      // We test for mobile class presence
      render(<VodTable vods={mockVodList} />);

      // Desktop table should have hidden class on mobile
      const table = screen.getByRole('table');
      expect(table).toHaveClass('hidden', 'md:table');
    });

    it('renders mobile cards list', () => {
      render(<VodTable vods={mockVodList} />);

      // Mobile view should be visible on small screens
      const mobileView = screen.getByTestId('vod-mobile-view');
      expect(mobileView).toHaveClass('md:hidden');
    });

    it('mobile cards are clickable', async () => {
      const user = userEvent.setup();
      render(<VodTable vods={mockVodList} />);

      const mobileCards = screen.getAllByTestId('vod-mobile-card');
      await user.click(mobileCards[0]);

      expect(mockPush).toHaveBeenCalledWith('/vod/vod-1');
    });
  });

  describe('Accessibility', () => {
    it('rows have cursor pointer style', () => {
      render(<VodTable vods={mockVodList} />);

      const rows = screen.getAllByRole('row').filter((row) => {
        // Filter out header row
        return within(row).queryAllByRole('cell').length > 0;
      });

      rows.forEach((row) => {
        expect(row).toHaveClass('cursor-pointer');
      });
    });

    it('accepts additional className prop', () => {
      const { container } = render(
        <VodTable vods={mockVodList} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
