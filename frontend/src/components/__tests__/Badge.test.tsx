import { render, screen } from '@testing-library/react';

import Badge from '../Badge';

describe('Badge', () => {
  describe('variants', () => {
    it('renders live variant with pulse animation', () => {
      render(<Badge variant="live">Live</Badge>);

      const badge = screen.getByText('Live');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-red-100');
      expect(badge).toHaveClass('text-red-600');

      // Check for pulse indicator
      const pulseIndicator = badge.querySelector('.animate-pulse');
      expect(pulseIndicator).toBeInTheDocument();
    });

    it('renders success variant with green colors', () => {
      render(<Badge variant="success">Completed</Badge>);

      const badge = screen.getByText('Completed');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('text-green-600');
    });

    it('renders warning variant with yellow colors', () => {
      render(<Badge variant="warning">Processing</Badge>);

      const badge = screen.getByText('Processing');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-yellow-100');
      expect(badge).toHaveClass('text-yellow-600');
    });

    it('renders secondary variant with gray colors', () => {
      render(<Badge variant="secondary">VOD</Badge>);

      const badge = screen.getByText('VOD');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-gray-100');
      expect(badge).toHaveClass('text-gray-700');
    });
  });

  describe('styling', () => {
    it('has correct base styles', () => {
      render(<Badge variant="success">Test</Badge>);

      const badge = screen.getByText('Test');
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-1');
      expect(badge).toHaveClass('rounded');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('font-semibold');
    });

    it('accepts additional className', () => {
      render(<Badge variant="success" className="custom-class">Test</Badge>);

      const badge = screen.getByText('Test');
      expect(badge).toHaveClass('custom-class');
    });
  });
});
