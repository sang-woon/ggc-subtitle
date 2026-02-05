import React from 'react';

export interface SubtitleItemProps {
  startTime: number;
  text: string;
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

function highlightText(text: string, query?: string): React.ReactNode {
  if (!query || query.trim() === '') {
    return text;
  }

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <span key={index} className="bg-highlight px-0.5 rounded">
          {part}
        </span>
      );
    }
    return part;
  });
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function SubtitleItem({
  startTime,
  text,
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
      <span className="block font-mono text-xs text-gray-500 mb-1">
        {formatTime(startTime)}
      </span>
      <span className="block text-sm text-gray-900 leading-relaxed">
        {highlightText(text, highlightQuery)}
      </span>
    </button>
  );
}
