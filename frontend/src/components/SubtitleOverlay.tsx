'use client';

import React from 'react';

import type { SubtitleType } from '../types';

export interface SubtitleOverlayProps {
  /** 전체 자막 배열 (최신 2개만 표시) */
  subtitles: SubtitleType[];
  /** 표시할 최대 줄 수 (기본값: 2) */
  maxLines?: number;
  /** STT interim (미확정) 텍스트 - 확정 전 미리보기 */
  interimText?: string;
}

/**
 * 영상 위에 오버레이되는 자막 컴포넌트
 *
 * - 반투명 검정 배경에 흰색 텍스트
 * - 최대 2줄 표시 (슬라이딩: 3번째 줄 → 1번째 사라짐, 2번째→1번째, 3번째→2번째)
 * - 화자 라벨 표시
 */
const SubtitleOverlay = React.memo(function SubtitleOverlay({
  subtitles,
  maxLines = 2,
  interimText,
}: SubtitleOverlayProps) {
  // 최신 N개만 표시
  const visible = subtitles.slice(-maxLines);

  if (visible.length === 0 && !interimText) return null;

  return (
    <div
      data-testid="subtitle-overlay"
      className="absolute bottom-10 left-4 w-[92%] max-w-[800px] pointer-events-none"
    >
      <div className="bg-black/75 rounded-lg px-5 py-3 backdrop-blur-sm">
        {visible.map((subtitle) => (
          <p
            key={subtitle.id}
            className="text-white text-base leading-relaxed text-left transition-all duration-300"
          >
            {subtitle.speaker && (
              <span className="text-blue-300 text-sm mr-1.5">
                [{subtitle.speaker}]
              </span>
            )}
            {subtitle.text}
          </p>
        ))}
        {interimText && (
          <p className="text-white/60 text-base leading-relaxed text-left italic">
            {interimText}
          </p>
        )}
      </div>
    </div>
  );
});

export default SubtitleOverlay;
