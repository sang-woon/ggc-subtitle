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
  /** STT interim (미확정) 텍스트 - 확정 전 실시간 미리보기 */
  interimText?: string;
  /** 데이터 로딩 중 여부 (false이고 자막이 없으면 '자막 없음' 표시) */
  isLoading?: boolean;
  /** 실시간 모드 여부. true면 클릭 시 시점 이동 불가 안내 */
  isLive?: boolean;
  /** STT 시작 시각 (ms timestamp). 설정 시 각 자막에 실제 시계 시간 표시 */
  sttStartedAt?: number | null;
  /** 실시간 클릭 시 안내 콜백 */
  onLiveClickNotice?: () => void;
}

/**
 * 시계 시간 포맷 (ms timestamp + 경과 초 → "HH:MM:SS")
 */
function formatClockTime(sttStartedAt: number, startTime: number): string {
  const date = new Date(sttStartedAt + startTime * 1000);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((v) => v.toString().padStart(2, '0'))
    .join(':');
}

const SubtitlePanel = React.memo(function SubtitlePanel({
  subtitles,
  searchQuery,
  currentTime,
  autoScroll = true,
  onSubtitleClick,
  interimText,
  isLoading = true,
  isLive = false,
  sttStartedAt = null,
  onLiveClickNotice,
}: SubtitlePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevSubtitleCountRef = useRef(subtitles.length);

  // Auto-scroll to top when new subtitles are added (최신 자막이 맨 위)
  useEffect(() => {
    if (autoScroll && subtitles.length > prevSubtitleCountRef.current) {
      if (listRef.current) {
        listRef.current.scrollTop = 0;
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
        {subtitles.length === 0 && !interimText ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
            {isLoading ? (
              <>
                <div
                  data-testid="loading-spinner"
                  className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin mb-4"
                />
                <p className="text-sm">자막을 불러오는 중...</p>
              </>
            ) : (
              <p className="text-sm">등록된 자막이 없습니다.</p>
            )}
          </div>
        ) : (
          <>
            {/* Interim (미확정) 실시간 자막 */}
            {interimText && (
              <div
                data-testid="interim-subtitle"
                className="px-4 py-3 border-b border-blue-100 bg-blue-50/50"
              >
                <span className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                  <span className="text-xs font-medium text-blue-600">인식 중...</span>
                </span>
                <span className="block text-sm text-gray-500 italic leading-relaxed">
                  {interimText}
                </span>
              </div>
            )}
            {[...subtitles].reverse().map((subtitle) => (
            <SubtitleItem
              key={subtitle.id}
              startTime={subtitle.start_time}
              text={subtitle.text}
              speaker={subtitle.speaker}
              isCurrent={currentSubtitleId === subtitle.id}
              highlightQuery={searchQuery}
              onClick={onSubtitleClick}
              isLive={isLive}
              onLiveClickNotice={onLiveClickNotice}
              clockTime={sttStartedAt ? formatClockTime(sttStartedAt, subtitle.start_time) : null}
            />
          ))}
          </>
        )}
      </div>
    </div>
  );
});

export default SubtitlePanel;
