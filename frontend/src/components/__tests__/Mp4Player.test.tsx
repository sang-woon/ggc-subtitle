import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import Mp4Player from '../Mp4Player';

describe('Mp4Player', () => {
  const defaultProps = {
    vodUrl: 'https://example.com/video.mp4',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders video element', () => {
      render(<Mp4Player {...defaultProps} />);

      const video = screen.getByTestId('mp4-video');
      expect(video).toBeInTheDocument();
      expect(video.tagName).toBe('VIDEO');
    });

    it('renders container with correct test id', () => {
      render(<Mp4Player {...defaultProps} />);

      expect(screen.getByTestId('mp4-player-container')).toBeInTheDocument();
    });

    it('sets video src to vodUrl', () => {
      render(<Mp4Player {...defaultProps} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      expect(video.src).toBe(defaultProps.vodUrl);
    });

    it('renders in 16:9 aspect ratio container', () => {
      render(<Mp4Player {...defaultProps} />);

      const container = screen.getByTestId('mp4-player-container');
      expect(container).toHaveClass('aspect-video');
    });
  });

  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      render(<Mp4Player {...defaultProps} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('hides loading spinner after video loads', async () => {
      render(<Mp4Player {...defaultProps} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      fireEvent.loadedData(video);

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when video fails to load', async () => {
      render(<Mp4Player {...defaultProps} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      fireEvent.error(video);

      await waitFor(() => {
        expect(screen.getByText(/영상을 불러올 수 없습니다/)).toBeInTheDocument();
      });
    });

    it('calls onError callback when error occurs', async () => {
      const handleError = jest.fn();
      render(<Mp4Player {...defaultProps} onError={handleError} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      fireEvent.error(video);

      await waitFor(() => {
        expect(handleError).toHaveBeenCalled();
      });
    });
  });

  describe('callbacks', () => {
    it('calls onTimeUpdate with current time during playback', async () => {
      const handleTimeUpdate = jest.fn();
      render(<Mp4Player {...defaultProps} onTimeUpdate={handleTimeUpdate} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 10.5, writable: true });
      fireEvent.timeUpdate(video);

      await waitFor(() => {
        expect(handleTimeUpdate).toHaveBeenCalledWith(10.5);
      });
    });

    it('calls onReady when video can play', async () => {
      const handleReady = jest.fn();
      render(<Mp4Player {...defaultProps} onReady={handleReady} />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      fireEvent.loadedData(video);

      await waitFor(() => {
        expect(handleReady).toHaveBeenCalled();
      });
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to video element', () => {
      const videoRef = { current: null };
      render(<Mp4Player {...defaultProps} videoRef={videoRef} />);

      expect(videoRef.current).toBeInstanceOf(HTMLVideoElement);
    });
  });

  describe('styling', () => {
    it('has black background', () => {
      render(<Mp4Player {...defaultProps} />);

      const container = screen.getByTestId('mp4-player-container');
      expect(container).toHaveClass('bg-black');
    });

    it('has rounded corners', () => {
      render(<Mp4Player {...defaultProps} />);

      const container = screen.getByTestId('mp4-player-container');
      expect(container).toHaveClass('rounded-lg');
    });
  });

  describe('URL changes', () => {
    it('updates video source when vodUrl changes', () => {
      const { rerender } = render(<Mp4Player vodUrl="https://example.com/video1.mp4" />);

      const video = screen.getByTestId('mp4-video') as HTMLVideoElement;
      expect(video.src).toBe('https://example.com/video1.mp4');

      rerender(<Mp4Player vodUrl="https://example.com/video2.mp4" />);

      expect(video.src).toBe('https://example.com/video2.mp4');
    });
  });
});
