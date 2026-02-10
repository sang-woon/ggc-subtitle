import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VodRegisterModal from '../VodRegisterModal';

import type { VodRegisterFormType } from '../../types';

describe('VodRegisterModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render modal when isOpen is false', () => {
      render(<VodRegisterModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders modal title', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByText('VOD 등록')).toBeInTheDocument();
    });

    it('renders URL form field', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByLabelText('VOD URL')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByText(/KMS URL을 입력하면/)).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has role="dialog" attribute', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('has aria-label on the dialog', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-label', 'VOD 등록');
    });

    it('has aria-modal attribute', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('close behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '취소' }));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when overlay is clicked', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      const overlay = screen.getByTestId('modal-overlay');
      await user.click(overlay);

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('form validation', () => {
    it('shows error when URL is empty on submit', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('VOD URL을 입력해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows error when URL is not a valid URL', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('VOD URL'), 'not-a-valid-url');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('올바른 URL 형식을 입력해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('clears error when user starts typing', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      // Submit to trigger error
      await user.click(screen.getByRole('button', { name: '등록' }));
      expect(screen.getByText('VOD URL을 입력해주세요.')).toBeInTheDocument();

      // Start typing to clear error
      await user.type(screen.getByLabelText('VOD URL'), 'h');

      expect(screen.queryByText('VOD URL을 입력해주세요.')).not.toBeInTheDocument();
    });
  });

  describe('successful submission', () => {
    it('calls onSubmit with URL when field is valid', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('VOD URL'), 'http://kms.ggc.go.kr/caster/player/vodViewer.do?midx=137982');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        url: 'http://kms.ggc.go.kr/caster/player/vodViewer.do?midx=137982',
      } satisfies VodRegisterFormType);
    });

    it('accepts https URLs as valid', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('VOD URL'), 'https://example.com/vod/456.mp4');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        url: 'https://example.com/vod/456.mp4',
      });
    });

    it('resets form after modal is closed and reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('VOD URL'), 'https://example.com/vod/123.mp4');
      await user.click(screen.getByRole('button', { name: '등록' }));

      // Simulate closing and reopening
      rerender(<VodRegisterModal {...defaultProps} isOpen={false} />);
      rerender(<VodRegisterModal {...defaultProps} isOpen={true} />);

      expect(screen.getByLabelText('VOD URL')).toHaveValue('');
    });
  });

  describe('loading state', () => {
    it('shows loading text on submit button', () => {
      render(<VodRegisterModal {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: '등록 중...' })).toBeInTheDocument();
    });

    it('disables input and buttons when loading', () => {
      render(<VodRegisterModal {...defaultProps} isLoading={true} />);

      expect(screen.getByLabelText('VOD URL')).toBeDisabled();
      expect(screen.getByRole('button', { name: '등록 중...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    });
  });

  describe('error message from parent', () => {
    it('displays errorMessage prop', () => {
      render(<VodRegisterModal {...defaultProps} errorMessage="이미 등록된 VOD입니다." />);

      expect(screen.getByText('이미 등록된 VOD입니다.')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has overlay backdrop', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const overlay = screen.getByTestId('modal-overlay');
      expect(overlay).toHaveClass('fixed');
      expect(overlay).toHaveClass('inset-0');
    });

    it('submit button has primary style', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: '등록' });
      expect(submitButton).toHaveClass('bg-blue-600');
      expect(submitButton).toHaveClass('text-white');
    });

    it('cancel button has secondary style', () => {
      render(<VodRegisterModal {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: '취소' });
      expect(cancelButton).toHaveClass('border');
      expect(cancelButton).toHaveClass('border-gray-300');
    });
  });
});
