'use client';

import { cn } from '@/lib/utils';

interface SubtitleOverlayProps {
  text: string;
  isInterim?: boolean;
  className?: string;
}

/**
 * YouTube 스타일 자막 오버레이
 * - 최대 3줄로 제한
 * - 중간 결과(isInterim)는 회색으로 구분
 * - 텍스트가 길면 뒤에서 자르고 ... 추가
 */
export function SubtitleOverlay({ text, isInterim = false, className }: SubtitleOverlayProps) {
  if (!text) return null;

  // 한 줄당 대략 40자 정도, 3줄이면 120자
  const maxChars = 120;
  const displayText = text.length > maxChars
    ? '...' + text.slice(-maxChars)  // 최신 내용 보여주기 위해 뒤에서 자름
    : text;

  return (
    <div
      className={cn(
        'absolute bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl text-center',
        className
      )}
    >
      <div
        className={cn(
          'inline-block px-5 py-3 rounded-lg text-lg font-medium',
          'bg-black/85 shadow-lg backdrop-blur-sm',
          // 보정 완료: 흰색, 보정 중: 회색
          isInterim ? 'text-gray-400' : 'text-white'
        )}
        style={{
          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.9)',
          maxHeight: '6em', // 약 3줄 (lineHeight 2 기준)
          lineHeight: '2',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {isInterim && (
          <span className="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2 animate-pulse" />
        )}
        {displayText}
      </div>
    </div>
  );
}
