import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VodRegisterModal from '../VodRegisterModal';
import { VodRegisterFormType } from '../../types';

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

    it('renders all form fields', () => {
      render(<VodRegisterModal {...defaultProps} />);

      expect(screen.getByLabelText('회의 제목')).toBeInTheDocument();
      expect(screen.getByLabelText('회의 날짜')).toBeInTheDocument();
      expect(screen.getByLabelText('VOD URL')).toBeInTheDocument();
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
    it('shows error when title is empty on submit', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('회의 제목을 입력해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows error when title is less than 2 characters', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '가');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('회의 제목은 2자 이상이어야 합니다.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows error when meeting_date is empty on submit', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '테스트 회의');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('회의 날짜를 선택해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows error when vod_url is empty on submit', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '테스트 회의');
      await user.type(screen.getByLabelText('회의 날짜'), '2024-01-15');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('VOD URL을 입력해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows error when vod_url is not a valid URL', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '테스트 회의');
      await user.type(screen.getByLabelText('회의 날짜'), '2024-01-15');
      await user.type(screen.getByLabelText('VOD URL'), 'not-a-valid-url');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('올바른 URL 형식을 입력해주세요.')).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows multiple errors at once', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(screen.getByText('회의 제목을 입력해주세요.')).toBeInTheDocument();
      expect(screen.getByText('회의 날짜를 선택해주세요.')).toBeInTheDocument();
      expect(screen.getByText('VOD URL을 입력해주세요.')).toBeInTheDocument();
    });

    it('clears errors when user starts typing', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      // Submit to trigger errors
      await user.click(screen.getByRole('button', { name: '등록' }));
      expect(screen.getByText('회의 제목을 입력해주세요.')).toBeInTheDocument();

      // Start typing to clear error
      await user.type(screen.getByLabelText('회의 제목'), '테');

      expect(screen.queryByText('회의 제목을 입력해주세요.')).not.toBeInTheDocument();
    });
  });

  describe('successful submission', () => {
    it('calls onSubmit with form data when all fields are valid', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '제1차 본회의');
      await user.type(screen.getByLabelText('회의 날짜'), '2024-01-15');
      await user.type(screen.getByLabelText('VOD URL'), 'https://example.com/vod/123.mp4');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        title: '제1차 본회의',
        meeting_date: '2024-01-15',
        vod_url: 'https://example.com/vod/123.mp4',
      } satisfies VodRegisterFormType);
    });

    it('accepts http URLs as valid', async () => {
      const user = userEvent.setup();
      render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '제2차 본회의');
      await user.type(screen.getByLabelText('회의 날짜'), '2024-02-20');
      await user.type(screen.getByLabelText('VOD URL'), 'http://example.com/vod/456.mp4');
      await user.click(screen.getByRole('button', { name: '등록' }));

      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        title: '제2차 본회의',
        meeting_date: '2024-02-20',
        vod_url: 'http://example.com/vod/456.mp4',
      });
    });

    it('resets form after successful submission', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<VodRegisterModal {...defaultProps} />);

      await user.type(screen.getByLabelText('회의 제목'), '제1차 본회의');
      await user.type(screen.getByLabelText('회의 날짜'), '2024-01-15');
      await user.type(screen.getByLabelText('VOD URL'), 'https://example.com/vod/123.mp4');
      await user.click(screen.getByRole('button', { name: '등록' }));

      // Simulate closing and reopening
      rerender(<VodRegisterModal {...defaultProps} isOpen={false} />);
      rerender(<VodRegisterModal {...defaultProps} isOpen={true} />);

      expect(screen.getByLabelText('회의 제목')).toHaveValue('');
      expect(screen.getByLabelText('회의 날짜')).toHaveValue('');
      expect(screen.getByLabelText('VOD URL')).toHaveValue('');
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
