import React from 'react';

import { highlightText as highlightTextUtil } from '../utils/highlight';

export interface SubtitleItemProps {
  startTime: number;
  text: string;
  speaker?: string | null;
  isCurrent?: boolean;
  highlightQuery?: string;
  onClick?: (startTime: number) => void;
  /** 실제 시계 시간 (ISO string 또는 Date). 설정 시 경과 시간 옆에 표시 */
  clockTime?: string | null;
  /** 실시간 모드 여부. true면 클릭 시 시점 이동 불가 안내 */
  isLive?: boolean;
  /** 실시간 클릭 시 안내 콜백 */
  onLiveClickNotice?: () => void;
  /** AI 교정 완료 여부 */
  isCorrected?: boolean;
}

/**
 * Returns Tailwind CSS classes for speaker badge based on speaker name
 */
function getSpeakerColor(speaker: string | null): { bg: string; text: string } {
  if (!speaker) {
    return { bg: 'bg-gray-100', text: 'text-gray-600' };
  }

  switch (speaker) {
    case '화자 1':
      return { bg: 'bg-blue-100', text: 'text-blue-700' };
    case '화자 2':
      return { bg: 'bg-green-100', text: 'text-green-700' };
    case '화자 3':
      return { bg: 'bg-purple-100', text: 'text-purple-700' };
    case '화자 4':
      return { bg: 'bg-orange-100', text: 'text-orange-700' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-600' };
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [hours, minutes, secs]
    .map((v) => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Renders text with optional query highlighting
 * Uses the shared highlight utility for XSS-safe highlighting
 */
function renderHighlightedText(text: string, query?: string): React.ReactNode {
  if (!query || query.trim() === '') {
    return text;
  }

  const result = highlightTextUtil(text, query);

  if (!result.hasMatch) {
    return text;
  }

  // Using dangerouslySetInnerHTML is safe here because highlightTextUtil
  // properly escapes all HTML in the input text before adding highlight marks
  return (
    <span
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

export default function SubtitleItem({
  startTime,
  text,
  speaker,
  isCurrent = false,
  highlightQuery,
  onClick,
  clockTime,
  isLive = false,
  onLiveClickNotice,
  isCorrected = false,
}: SubtitleItemProps) {
  const baseStyles = 'w-full text-left px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50';
  const currentStyles = isCurrent ? 'bg-blue-50 border-l-4 border-primary' : '';

  const handleClick = () => {
    if (isLive) {
      onLiveClickNotice?.();
      return;
    }
    onClick?.(startTime);
  };

  const speakerColors = getSpeakerColor(speaker ?? null);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseStyles} ${currentStyles}`.trim()}
    >
      <span className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-gray-500">
          {formatTime(startTime)}
        </span>
        {clockTime && (
          <span className="font-mono text-xs text-gray-400" title="실제 시각">
            ({clockTime})
          </span>
        )}
        {speaker && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${speakerColors.bg} ${speakerColors.text}`}
          >
            {speaker}
          </span>
        )}
      </span>
      <span className="block text-sm text-gray-900 leading-relaxed">
        {renderHighlightedText(text, highlightQuery)}
        {isCorrected && (
          <span className="inline-block ml-1 text-xs text-emerald-600" title="AI 교정됨">
            &#10003;
          </span>
        )}
      </span>
    </button>
  );
}
