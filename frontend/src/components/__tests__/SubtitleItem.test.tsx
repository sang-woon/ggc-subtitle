import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SubtitleItem from '../SubtitleItem';

describe('SubtitleItem', () => {
  const defaultProps = {
    startTime: 3661.5, // 1:01:01.5
    text: 'Test subtitle text',
  };

  describe('time formatting', () => {
    it('formats time as HH:MM:SS', () => {
      render(<SubtitleItem {...defaultProps} />);

      expect(screen.getByText('01:01:01')).toBeInTheDocument();
    });

    it('formats time correctly for hours < 10', () => {
      render(<SubtitleItem startTime={3600} text="Text" />);

      expect(screen.getByText('01:00:00')).toBeInTheDocument();
    });

    it('formats time correctly when no hours', () => {
      render(<SubtitleItem startTime={65} text="Text" />);

      expect(screen.getByText('00:01:05')).toBeInTheDocument();
    });

    it('uses monospace font for time', () => {
      render(<SubtitleItem {...defaultProps} />);

      const time = screen.getByText('01:01:01');
      expect(time).toHaveClass('font-mono');
    });
  });

  describe('text display', () => {
    it('displays the subtitle text', () => {
      render(<SubtitleItem {...defaultProps} />);

      expect(screen.getByText('Test subtitle text')).toBeInTheDocument();
    });
  });

  describe('current highlight', () => {
    it('highlights when isCurrent is true', () => {
      render(<SubtitleItem {...defaultProps} isCurrent />);

      const item = screen.getByRole('button');
      expect(item).toHaveClass('bg-blue-50');
      expect(item).toHaveClass('border-l-4');
      expect(item).toHaveClass('border-primary');
    });

    it('does not highlight when isCurrent is false', () => {
      render(<SubtitleItem {...defaultProps} isCurrent={false} />);

      const item = screen.getByRole('button');
      expect(item).not.toHaveClass('bg-blue-50');
      expect(item).not.toHaveClass('border-l-4');
    });
  });

  describe('keyword highlight', () => {
    it('highlights matching keywords', () => {
      render(<SubtitleItem {...defaultProps} highlightQuery="subtitle" />);

      const highlight = screen.getByText('subtitle');
      expect(highlight).toHaveClass('bg-highlight');
    });

    it('is case insensitive when highlighting', () => {
      render(<SubtitleItem {...defaultProps} highlightQuery="TEST" />);

      const highlight = screen.getByText('Test');
      expect(highlight).toHaveClass('bg-highlight');
    });

    it('highlights multiple occurrences', () => {
      render(<SubtitleItem startTime={0} text="test one test two" highlightQuery="test" />);

      const highlights = screen.getAllByText('test');
      expect(highlights).toHaveLength(2);
      highlights.forEach((el) => {
        expect(el).toHaveClass('bg-highlight');
      });
    });
  });

  describe('click interaction', () => {
    it('calls onClick with startTime when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<SubtitleItem {...defaultProps} onClick={handleClick} />);

      await user.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledWith(3661.5);
    });

    it('has hover styles', () => {
      render(<SubtitleItem {...defaultProps} />);

      const item = screen.getByRole('button');
      expect(item).toHaveClass('hover:bg-gray-50');
    });
  });

  describe('styling', () => {
    it('has correct base styles', () => {
      render(<SubtitleItem {...defaultProps} />);

      const item = screen.getByRole('button');
      expect(item).toHaveClass('px-4');
      expect(item).toHaveClass('py-3');
      expect(item).toHaveClass('border-b');
      expect(item).toHaveClass('cursor-pointer');
    });

    it('time has gray color', () => {
      render(<SubtitleItem {...defaultProps} />);

      const time = screen.getByText('01:01:01');
      expect(time).toHaveClass('text-gray-500');
    });

    it('text has dark color', () => {
      render(<SubtitleItem {...defaultProps} />);

      const text = screen.getByText('Test subtitle text');
      expect(text).toHaveClass('text-gray-900');
    });
  });
});
