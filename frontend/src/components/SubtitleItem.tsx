import React from 'react';

import { highlightText as highlightTextUtil } from '../utils/highlight';

export interface SubtitleItemProps {
  startTime: number;
  text: string;
  speaker?: string | null;
  isCurrent?: boolean;
  highlightQuery?: string;
  onClick?: (startTime: number) => void;
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
}: SubtitleItemProps) {
  const baseStyles = 'w-full text-left px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50';
  const currentStyles = isCurrent ? 'bg-blue-50 border-l-4 border-primary' : '';

  const handleClick = () => {
    onClick?.(startTime);
  };

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
        {speaker && (
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
            {speaker}
          </span>
        )}
      </span>
      <span className="block text-sm text-gray-900 leading-relaxed">
        {renderHighlightedText(text, highlightQuery)}
      </span>
    </button>
  );
}
