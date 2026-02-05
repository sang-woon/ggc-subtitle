'use client';

import React, { useState } from 'react';

export interface VideoControlsProps {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

/**
 * Format seconds into mm:ss or h:mm:ss
 */
function formatTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function VideoControls({
  videoRef,
  currentTime,
  duration,
}: VideoControlsProps) {
  const [playbackRate, setPlaybackRate] = useState(1);
  const video = videoRef.current;
  const isPaused = video ? video.paused : true;

  const handlePlayPause = () => {
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!video) return;
    const newTime = Number(e.target.value);
    video.currentTime = newTime;
  };

  const handleSpeedChange = (speed: number) => {
    if (video) {
      video.playbackRate = speed;
    }
    setPlaybackRate(speed);
  };

  return (
    <div
      data-testid="video-controls"
      className="flex flex-col gap-2 px-4 py-3 bg-white border border-gray-200 rounded-b-lg"
    >
      {/* Timeline seekbar */}
      <input
        data-testid="timeline-seekbar"
        type="range"
        min="0"
        max={String(duration)}
        value={String(currentTime)}
        onChange={handleSeek}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left: Play/Pause + Time */}
        <div className="flex items-center gap-3">
          <button
            data-testid="play-pause-button"
            onClick={handlePlayPause}
            aria-label={isPaused ? '재생' : '일시정지'}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            {isPaused ? (
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>

          <span data-testid="time-display" className="text-sm text-gray-600 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Right: Speed selector */}
        <div data-testid="speed-selector" className="flex items-center gap-1">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                playbackRate === speed
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
