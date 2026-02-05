'use client';

import React, { useEffect, useRef } from 'react';

import SubtitleItem from './SubtitleItem';

import type { SubtitleType } from '../types';

export interface SubtitlePanelProps {
  subtitles: SubtitleType[];
  searchQuery?: string;
  currentTime?: number;
  autoScroll?: boolean;
  onSubtitleClick?: (startTime: number) => void;
}

export default function SubtitlePanel({
  subtitles,
  searchQuery,
  currentTime,
  autoScroll = true,
  onSubtitleClick,
}: SubtitlePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevSubtitleCountRef = useRef(subtitles.length);

  // Auto-scroll when new subtitles are added
  useEffect(() => {
    if (autoScroll && subtitles.length > prevSubtitleCountRef.current) {
      const lastItem = listRef.current?.lastElementChild;
      if (lastItem) {
        lastItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    prevSubtitleCountRef.current = subtitles.length;
  }, [subtitles.length, autoScroll]);

  // Determine current subtitle based on currentTime
  const getCurrentSubtitleId = () => {
    if (currentTime === undefined) return null;
    const current = subtitles.find(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    return current?.id ?? null;
  };

  const currentSubtitleId = getCurrentSubtitleId();

  return (
    <div
      data-testid="subtitle-panel"
      className="h-full flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="font-semibold text-gray-900">자막</h2>
        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium text-gray-600 bg-gray-200 rounded-full">
          {subtitles.length}
        </span>
      </div>

      {/* Subtitle list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {subtitles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
            <div
              data-testid="loading-spinner"
              className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin mb-4"
            />
            <p className="text-sm">자막을 불러오는 중...</p>
          </div>
        ) : (
          subtitles.map((subtitle) => (
            <SubtitleItem
              key={subtitle.id}
              startTime={subtitle.start_time}
              text={subtitle.text}
              isCurrent={currentSubtitleId === subtitle.id}
              highlightQuery={searchQuery}
              onClick={onSubtitleClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
