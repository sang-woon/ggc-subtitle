import { render, screen, waitFor } from '@testing-library/react';

import HlsPlayer from '../HlsPlayer';

// Mock HLS.js
const mockAttachMedia = jest.fn();
const mockLoadSource = jest.fn();
const mockDestroy = jest.fn();
const mockOn = jest.fn();

jest.mock('hls.js', () => {
  const Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    ERROR: 'hlsError',
  } as const;

  const ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  } as const;

  return {
    __esModule: true,
    default: class MockHls {
      static isSupported() {
        return true;
      }
      static Events = Events;
      static ErrorTypes = ErrorTypes;
      attachMedia = mockAttachMedia;
      loadSource = mockLoadSource;
      destroy = mockDestroy;
      on = mockOn;
    },
  };
});

describe('HlsPlayer', () => {
  const defaultProps = {
    streamUrl: 'https://example.com/stream.m3u8',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders video element', () => {
      render(<HlsPlayer {...defaultProps} />);

      const video = screen.getByTestId('hls-video');
      expect(video).toBeInTheDocument();
      expect(video.tagName).toBe('VIDEO');
    });

    it('has video controls', () => {
      render(<HlsPlayer {...defaultProps} />);

      const video = screen.getByTestId('hls-video');
      expect(video).toHaveAttribute('controls');
    });

    it('renders in 16:9 aspect ratio container', () => {
      render(<HlsPlayer {...defaultProps} />);

      const container = screen.getByTestId('hls-player-container');
      expect(container).toHaveClass('aspect-video');
    });
  });

  describe('HLS initialization', () => {
    it('initializes HLS with stream URL', async () => {
      render(<HlsPlayer {...defaultProps} />);

      await waitFor(() => {
        expect(mockLoadSource).toHaveBeenCalledWith(defaultProps.streamUrl);
      });
    });

    it('attaches media to video element', async () => {
      render(<HlsPlayer {...defaultProps} />);

      await waitFor(() => {
        expect(mockAttachMedia).toHaveBeenCalled();
      });
    });

    it('destroys HLS instance on unmount', async () => {
      const { unmount } = render(<HlsPlayer {...defaultProps} />);

      unmount();

      await waitFor(() => {
        expect(mockDestroy).toHaveBeenCalled();
      });
    });

    it('reloads when stream URL changes', async () => {
      const { rerender } = render(<HlsPlayer streamUrl="https://example.com/stream1.m3u8" />);

      expect(mockLoadSource).toHaveBeenCalledWith('https://example.com/stream1.m3u8');

      rerender(<HlsPlayer streamUrl="https://example.com/stream2.m3u8" />);

      await waitFor(() => {
        expect(mockLoadSource).toHaveBeenCalledWith('https://example.com/stream2.m3u8');
      });
    });
  });

  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      render(<HlsPlayer {...defaultProps} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('hides loading spinner after video loads', async () => {
      render(<HlsPlayer {...defaultProps} />);

      // Simulate video loading
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      video.dispatchEvent(new Event('loadeddata'));

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when stream fails', async () => {
      render(<HlsPlayer {...defaultProps} />);

      // Simulate error
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      video.dispatchEvent(new Event('error'));

      await waitFor(() => {
        expect(screen.getByText(/영상을 불러올 수 없습니다/)).toBeInTheDocument();
      });
    });

    it('calls onError callback when error occurs', async () => {
      const handleError = jest.fn();
      render(<HlsPlayer {...defaultProps} onError={handleError} />);

      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      video.dispatchEvent(new Event('error'));

      await waitFor(() => {
        expect(handleError).toHaveBeenCalled();
      });
    });
  });

  describe('fullscreen', () => {
    it('supports fullscreen via controls', () => {
      render(<HlsPlayer {...defaultProps} />);

      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      expect(video).toHaveAttribute('controls');
    });
  });

  describe('volume control', () => {
    it('video element has controls for volume', () => {
      render(<HlsPlayer {...defaultProps} />);

      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      expect(video).toHaveAttribute('controls');
    });
  });

  describe('styling', () => {
    it('has black background', () => {
      render(<HlsPlayer {...defaultProps} />);

      const container = screen.getByTestId('hls-player-container');
      expect(container).toHaveClass('bg-black');
    });

    it('has rounded corners', () => {
      render(<HlsPlayer {...defaultProps} />);

      const container = screen.getByTestId('hls-player-container');
      expect(container).toHaveClass('rounded-lg');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to video element', () => {
      const videoRef = { current: null };
      render(<HlsPlayer {...defaultProps} videoRef={videoRef} />);

      expect(videoRef.current).toBeInstanceOf(HTMLVideoElement);
    });
  });

  describe('HLS events', () => {
    it('calls onReady when manifest is parsed', async () => {
      const handleReady = jest.fn();

      // Capture the event handler passed to hls.on
      mockOn.mockImplementation((event, handler) => {
        if (event === 'hlsManifestParsed') {
          // Simulate manifest parsed immediately
          setTimeout(() => handler(), 0);
        }
      });

      render(<HlsPlayer {...defaultProps} onReady={handleReady} />);

      await waitFor(() => {
        expect(handleReady).toHaveBeenCalled();
      });
    });

    it('handles HLS fatal error', async () => {
      const handleError = jest.fn();

      mockOn.mockImplementation((event, handler) => {
        if (event === 'hlsError') {
          setTimeout(() => handler(null, { fatal: true, type: 'networkError' }), 0);
        }
      });

      render(<HlsPlayer {...defaultProps} onError={handleError} />);

      await waitFor(() => {
        expect(handleError).toHaveBeenCalled();
      });
    });

    it('ignores non-fatal HLS errors', async () => {
      const handleError = jest.fn();

      mockOn.mockImplementation((event, handler) => {
        if (event === 'hlsError') {
          setTimeout(() => handler(null, { fatal: false, type: 'networkError' }), 0);
        }
      });

      render(<HlsPlayer {...defaultProps} onError={handleError} />);

      // Wait a bit and ensure error wasn't called
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(handleError).not.toHaveBeenCalled();
    });
  });
});
