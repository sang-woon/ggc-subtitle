'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src?: string;
  autoPlay?: boolean;
  muted?: boolean;
  playbackRate?: number;
  onTimeUpdate?: (currentTimeMs: number) => void;
  onReady?: (videoElement: HTMLVideoElement) => void;
  onError?: (error: Error) => void;
  onPlaybackRateChange?: (rate: number) => void;
  className?: string;
  children?: React.ReactNode;
}

// 비디오 포맷 판별
function getVideoFormat(src: string): 'hls' | 'mp4' | 'unknown' {
  if (src.includes('.m3u8')) return 'hls';
  if (src.includes('.mp4')) return 'mp4';
  return 'unknown';
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer({
  src,
  autoPlay = false,
  muted = false,
  playbackRate = 1,
  onTimeUpdate,
  onReady,
  onError,
  onPlaybackRateChange,
  className,
  children,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState(playbackRate);
  const [showRateMenu, setShowRateMenu] = useState(false);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      onTimeUpdate?.(Math.floor(videoRef.current.currentTime * 1000));
    }
  }, [onTimeUpdate]);

  // 재생 속도 변경
  const handleRateChange = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setCurrentRate(rate);
      onPlaybackRateChange?.(rate);
    }
    setShowRateMenu(false);
  }, [onPlaybackRateChange]);

  // 외부에서 playbackRate prop 변경 시 적용
  useEffect(() => {
    if (videoRef.current && playbackRate !== currentRate) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, currentRate]);

  // playbackRate prop이 변경되면 currentRate 동기화
  useEffect(() => {
    setCurrentRate(playbackRate);
  }, [playbackRate]);

  // 비디오 로드
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);

    // 이전 HLS 인스턴스 정리
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const format = getVideoFormat(src);

    // MP4 직접 재생
    if (format === 'mp4' || format === 'unknown') {
      video.src = src;

      const handleLoadedMetadata = () => {
        setIsLoading(false);
        video.playbackRate = currentRate;
        onReady?.(video);
        if (autoPlay) {
          video.play().catch(console.error);
        }
      };

      const handleError = () => {
        setError('영상을 로드할 수 없습니다');
        onError?.(new Error('Video load failed'));
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleError);
      };
    }

    // HLS 스트림
    if (format === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // VOD에서는 안정성 우선
          maxBufferLength: 30, // 30초 버퍼 (기본 30)
          maxMaxBufferLength: 60, // 최대 60초까지 버퍼링
          maxBufferSize: 60 * 1000 * 1000, // 60MB 버퍼
          maxBufferHole: 0.5, // 버퍼 홀 허용 범위
          highBufferWatchdogPeriod: 2, // 버퍼 체크 간격
          startLevel: -1, // 자동 품질 선택
          abrEwmaDefaultEstimate: 500000, // 초기 대역폭 추정 (500kbps)
        });

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.playbackRate = currentRate;
          onReady?.(video);
          if (autoPlay) {
            video.play().catch(console.error);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setError('네트워크 오류가 발생했습니다');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setError('미디어 오류가 발생했습니다');
                hls.recoverMediaError();
                break;
              default:
                setError('영상을 로드할 수 없습니다');
                hls.destroy();
                break;
            }
            onError?.(new Error(data.details));
          }
        });

        hlsRef.current = hls;

        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari 네이티브 HLS 지원
        video.src = src;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          video.playbackRate = currentRate;
          onReady?.(video);
          if (autoPlay) {
            video.play().catch(console.error);
          }
        });
      } else {
        setError('이 브라우저에서는 HLS를 지원하지 않습니다');
        onError?.(new Error('HLS not supported'));
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, onReady, onError, currentRate]);

  // 시간 업데이트 이벤트
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [handleTimeUpdate]);

  return (
    <div className={cn('relative bg-black rounded-lg overflow-hidden', className)}>
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        muted={muted}
        playsInline
        crossOrigin="anonymous"
      />

      {/* 재생 속도 컨트롤 */}
      <div className="absolute top-2 right-2 z-10">
        <div className="relative">
          <button
            onClick={() => setShowRateMenu(!showRateMenu)}
            className="px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-sm rounded-lg font-medium transition-colors"
          >
            {currentRate}x
          </button>

          {showRateMenu && (
            <div className="absolute top-full right-0 mt-1 bg-black/90 rounded-lg overflow-hidden shadow-lg">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={cn(
                    'block w-full px-4 py-2 text-sm text-left hover:bg-white/20 transition-colors',
                    currentRate === rate ? 'text-blue-400 font-bold' : 'text-white'
                  )}
                >
                  {rate}x {rate === 1 && '(기본)'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>로딩 중...</span>
          </div>
        </div>
      )}

      {/* 에러 상태 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white p-4">
            <p className="text-red-400 mb-2">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
              }}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 자막 오버레이 등 children */}
      {children}
    </div>
  );
}

export function useVideoSeek(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const seekTo = useCallback((timeMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeMs / 1000;
    }
  }, [videoRef]);

  return { seekTo };
}
