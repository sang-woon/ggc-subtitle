'use client';

import { cn } from '@/lib/utils';

interface SubtitleOverlayProps {
  text: string;
  isInterim?: boolean;
  className?: string;
}

/**
 * YouTube 스타일 자막 오버레이
 * - 최대 2줄로 제한
 * - 중간 결과(isInterim)는 투명도로 구분
 * - 텍스트가 길면 뒤에서 자르고 ... 추가
 */
export function SubtitleOverlay({ text, isInterim = false, className }: SubtitleOverlayProps) {
  if (!text) return null;

  // 한 줄당 대략 40자 정도, 2줄이면 80자
  const maxChars = 80;
  const displayText = text.length > maxChars
    ? '...' + text.slice(-maxChars)  // 최신 내용 보여주기 위해 뒤에서 자름
    : text;

  return (
    <div
      className={cn(
        'absolute bottom-16 left-1/2 -translate-x-1/2 w-[85%] max-w-3xl text-center',
        className
      )}
    >
      <div
        className={cn(
          'inline-block px-4 py-2 rounded-lg text-lg font-medium',
          'bg-black/80 text-white',
          'shadow-lg backdrop-blur-sm',
          isInterim && 'border-l-4 border-yellow-400'
        )}
        style={{
          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.9)',
          maxHeight: '3.6em', // 약 2줄 (lineHeight 1.8 기준)
          lineHeight: '1.8',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {isInterim && (
          <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse" />
        )}
        <span className={cn(isInterim && 'text-yellow-100')}>
          {displayText}
        </span>
      </div>
    </div>
  );
}
