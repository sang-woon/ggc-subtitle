import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingType } from '@/types';

import RecentVodList from '../RecentVodList';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}));

describe('RecentVodList', () => {
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

  describe('when VOD list has items', () => {
    it('renders all VOD items', () => {
      render(<RecentVodList vods={mockVodList} />);

      expect(screen.getByText('제122회 본회의')).toBeInTheDocument();
      expect(screen.getByText('제121회 상임위원회')).toBeInTheDocument();
      expect(screen.getByText('제120회 예산결산위원회')).toBeInTheDocument();
    });

    it('displays the meeting date for each item', () => {
      render(<RecentVodList vods={mockVodList} />);

      expect(screen.getByText(/2026년 2월 4일/)).toBeInTheDocument();
      expect(screen.getByText(/2026년 2월 3일/)).toBeInTheDocument();
      expect(screen.getByText(/2026년 2월 2일/)).toBeInTheDocument();
    });

    it('displays the correct status badge for ended VOD', () => {
      render(<RecentVodList vods={mockVodList} />);

      // 'ended' status should show '자막 완료' badge
      const completedBadges = screen.getAllByText('자막 완료');
      expect(completedBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('displays the correct status badge for processing VOD', () => {
      render(<RecentVodList vods={mockVodList} />);

      // 'processing' status should show '자막 생성중' badge
      expect(screen.getByText('자막 생성중')).toBeInTheDocument();
    });

    it('navigates to /vod/:id when item is clicked', async () => {
      const user = userEvent.setup();
      render(<RecentVodList vods={mockVodList} />);

      const firstItem = screen.getByText('제122회 본회의');
      await user.click(firstItem);

      expect(mockPush).toHaveBeenCalledWith('/vod/vod-1');
    });

    it('displays duration in human-readable format', () => {
      render(<RecentVodList vods={mockVodList} />);

      // 5400 seconds = 1:30:00
      expect(screen.getByText(/1:30:00/)).toBeInTheDocument();
      // 7200 seconds = 2:00:00
      expect(screen.getByText(/2:00:00/)).toBeInTheDocument();
    });
  });

  describe('when VOD list is empty', () => {
    it('displays empty state message', () => {
      render(<RecentVodList vods={[]} />);

      expect(screen.getByText('등록된 VOD가 없습니다')).toBeInTheDocument();
    });

    it('does not render any list items', () => {
      render(<RecentVodList vods={[]} />);

      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });
  });

  describe('styling and accessibility', () => {
    it('has a proper section heading', () => {
      render(<RecentVodList vods={mockVodList} />);

      const heading = screen.getByRole('heading', { name: /최근 VOD/i });
      expect(heading).toBeInTheDocument();
    });

    it('renders items as list with proper roles', () => {
      render(<RecentVodList vods={mockVodList} />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
    });

    it('accepts additional className prop', () => {
      const { container } = render(
        <RecentVodList vods={mockVodList} className="custom-class" />
      );

      const section = container.firstChild;
      expect(section).toHaveClass('custom-class');
    });

    it('each item is keyboard accessible', () => {
      render(<RecentVodList vods={mockVodList} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });
  });
});
