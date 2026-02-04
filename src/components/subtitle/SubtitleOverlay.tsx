'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';

interface SubtitleOverlayProps {
  text: string;
  isInterim?: boolean;
  className?: string;
}

/**
 * 실시간 자막 오버레이
 * - 왼쪽 정렬
 * - 보정 중(노란색): 실시간 업데이트
 * - 보정 완료(흰색): 확정된 자막 유지
 */
export function SubtitleOverlay({
  text,
  isInterim = false,
  className,
}: SubtitleOverlayProps) {
  // 마지막으로 확정된 자막 (text가 비어도 유지)
  const [lastConfirmedText, setLastConfirmedText] = useState<string>('');
  const prevIsInterimRef = useRef<boolean>(true);
  const prevTextRef = useRef<string>('');

  useEffect(() => {
    // 보정 완료 감지: isInterim이 true → false로 변경되고, 이전 텍스트가 있을 때
    if (prevIsInterimRef.current && !isInterim && prevTextRef.current) {
      const confirmedText = prevTextRef.current.length > 60
        ? prevTextRef.current.slice(-60)
        : prevTextRef.current;
      setLastConfirmedText(confirmedText);
    }

    // 새로운 보정 시작: isInterim이 false → true로 변경될 때
    // 이전 확정 텍스트는 유지 (롤링 효과용)

    prevIsInterimRef.current = isInterim;
    if (text) {
      prevTextRef.current = text;
    }
  }, [text, isInterim]);

  // 표시할 텍스트 결정
  const displayText = text || lastConfirmedText;

  // 아무것도 표시할 게 없으면 숨김
  if (!displayText) return null;

  // 현재 표시할 텍스트 (잘라서 표시)
  const currentText = displayText.length > 60 ? displayText.slice(-60) : displayText;

  // 현재 상태: text가 있고 isInterim이면 보정 중, 아니면 확정
  const isCurrentlyInterim = isInterim && text;

  return (
    <div
      className={cn(
        'absolute bottom-12 left-4 w-[90%] max-w-4xl',
        className
      )}
    >
      <div style={{ minHeight: '2em' }}>
        <div
          className={cn(
            'text-left text-xl font-bold transition-colors duration-200',
            isCurrentlyInterim ? 'text-yellow-400' : 'text-white'
          )}
          style={{
            textShadow: '2px 2px 4px rgba(0, 0, 0, 1), -1px -1px 2px rgba(0, 0, 0, 0.8), 1px -1px 2px rgba(0, 0, 0, 0.8), -1px 1px 2px rgba(0, 0, 0, 0.8)',
            lineHeight: '1.8',
          }}
        >
          {isCurrentlyInterim && (
            <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse" />
          )}
          {currentText}
        </div>
      </div>
    </div>
  );
}
