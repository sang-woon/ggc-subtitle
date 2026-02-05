'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface Mp4PlayerProps {
  vodUrl: string;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (currentTime: number) => void;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export default function Mp4Player({
  vodUrl,
  videoRef,
  onTimeUpdate,
  onError,
  onReady,
}: Mp4PlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (videoRef) {
      videoRef.current = internalRef.current;
    }
  }, [videoRef]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [vodUrl]);

  const handleLoadedData = () => {
    setIsLoading(false);
    onReady?.();
  };

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
    onError?.(new Error('Video error'));
  };

  const handleTimeUpdate = () => {
    if (internalRef.current && onTimeUpdate) {
      onTimeUpdate(internalRef.current.currentTime);
    }
  };

  return (
    <div
      data-testid="mp4-player-container"
      className="relative bg-black rounded-lg overflow-hidden aspect-video"
    >
      <video
        ref={internalRef}
        data-testid="mp4-video"
        src={vodUrl}
        className="w-full h-full"
        onLoadedData={handleLoadedData}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
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
