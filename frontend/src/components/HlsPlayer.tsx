'use client';

import React, { useEffect, useRef, useState } from 'react';

import Hls from 'hls.js';

export interface HlsPlayerProps {
  streamUrl: string;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

const MAX_NETWORK_RETRIES = 3;

const HlsPlayer = React.memo(function HlsPlayer({ streamUrl, videoRef, onError, onReady }: HlsPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const networkRetryCount = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (videoRef) {
      videoRef.current = internalRef.current;
    }
  }, [videoRef]);

  useEffect(() => {
    const videoElement = internalRef.current;
    if (!videoElement) return;

    setIsLoading(true);
    setHasError(false);
    networkRetryCount.current = 0;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        // 라이브 스트리밍 버퍼 최적화
        liveSyncDurationCount: 3,        // 라이브 엣지에서 3세그먼트 뒤에서 재생
        liveMaxLatencyDurationCount: 10,  // 최대 10세그먼트 지연 허용 (넉넉하게)
        liveDurationInfinity: true,       // 라이브 스트림 무한 재생
        maxBufferLength: 30,              // 최대 30초 버퍼
        maxMaxBufferLength: 120,          // 버퍼 상한 120초 (넉넉하게)
        maxBufferSize: 100 * 1000 * 1000, // 100MB 버퍼
        maxBufferHole: 0.5,               // 0.5초 버퍼 홀 허용
        highBufferWatchdogPeriod: 2,      // 버퍼 워치독 2초
        // 네트워크 안정성
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        // 낮은 지연 모드 비활성화 (안정성 우선)
        lowLatencyMode: false,
        // 빠른 시작
        startLevel: -1,
        // backBuffer 유지 (되감기 가능)
        backBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.attachMedia(videoElement);
      hls.loadSource(streamUrl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        // 라이브 스트림 자동 재생
        videoElement.play().catch(() => {
          // autoplay 정책에 의해 차단될 수 있음 — muted로 재시도
          videoElement.muted = true;
          videoElement.play().catch(() => {});
        });
        onReady?.();
      });

      // 라이브 엣지에서 너무 밀리면 자동 복구
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!videoElement.paused && hls.liveSyncPosition) {
          const drift = hls.liveSyncPosition - videoElement.currentTime;
          // 20초 이상 밀렸으면 라이브 엣지로 점프
          if (drift > 20) {
            videoElement.currentTime = hls.liveSyncPosition - 3;
          }
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              networkRetryCount.current += 1;
              if (networkRetryCount.current <= MAX_NETWORK_RETRIES) {
                console.warn(`HLS network error, recovering... (${networkRetryCount.current}/${MAX_NETWORK_RETRIES})`);
                hls.startLoad();
              } else {
                console.error('HLS network error: max retries exceeded');
                setHasError(true);
                setIsLoading(false);
                onError?.(new Error('스트림에 연결할 수 없습니다'));
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              setHasError(true);
              setIsLoading(false);
              onError?.(new Error(`HLS Error: ${data.type}`));
              break;
          }
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoElement.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, onError, onReady]);

  const handleLoadedData = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
    onError?.(new Error('Video error'));
  };

  return (
    <div
      data-testid="hls-player-container"
      className="relative bg-black rounded-lg overflow-hidden aspect-video"
    >
      <video
        ref={internalRef}
        data-testid="hls-video"
        controls
        autoPlay
        playsInline
        className="w-full h-full"
        onLoadedData={handleLoadedData}
        onError={handleError}
      />

      {isLoading && (
        <div
          data-testid="loading-spinner"
          className="absolute inset-0 flex items-center justify-center bg-black/50"
        >
          <div className="w-12 h-12 border-4 border-gray-300 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
          <svg
            className="w-12 h-12 text-red-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-center">영상을 불러올 수 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">현재 방송 중이 아니거나 스트림에 문제가 있습니다</p>
        </div>
      )}
    </div>
  );
});

export default HlsPlayer;
