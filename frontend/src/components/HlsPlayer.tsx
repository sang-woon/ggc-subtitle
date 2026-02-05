'use client';

import React, { useEffect, useRef, useState } from 'react';

import Hls from 'hls.js';

export interface HlsPlayerProps {
  streamUrl: string;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export default function HlsPlayer({ streamUrl, videoRef, onError, onReady }: HlsPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
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

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;

      hls.attachMedia(videoElement);
      hls.loadSource(streamUrl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        onReady?.();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setHasError(true);
          setIsLoading(false);
          onError?.(new Error(`HLS Error: ${data.type}`));
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
          <p className="text-center">영상을 불러올 수 없습니다.</p>
          <p className="text-sm text-gray-400 mt-1">새로고침해주세요.</p>
        </div>
      )}
    </div>
  );
}
