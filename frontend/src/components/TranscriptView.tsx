'use client';

import React, { useMemo } from 'react';

import type { SubtitleType } from '@/types';

import SubtitleItem from './SubtitleItem';


export interface TranscriptViewProps {
  subtitles: SubtitleType[];
  searchQuery?: string;
  onSubtitleClick?: (startTime: number) => void;
}

/**
 * 전체 회의 트랜스크립트 뷰 - 회의록 상세 페이지에서 사용
 */
export default function TranscriptView({
  subtitles,
  searchQuery = '',
  onSubtitleClick,
}: TranscriptViewProps) {
  // 검색 필터링
  const displaySubtitles = useMemo(() => {
    if (!searchQuery.trim()) return subtitles;
    const q = searchQuery.toLowerCase();
    return subtitles.filter((s) => s.text.toLowerCase().includes(q));
  }, [subtitles, searchQuery]);

  // 발화자별 그룹핑 (연속된 같은 화자는 그룹핑)
  const groups = useMemo(() => {
    const result: { speaker: string | null; items: SubtitleType[] }[] = [];
    let currentGroup: { speaker: string | null; items: SubtitleType[] } | null = null;

    for (const sub of displaySubtitles) {
      if (currentGroup && currentGroup.speaker === sub.speaker) {
        currentGroup.items.push(sub);
      } else {
        currentGroup = { speaker: sub.speaker, items: [sub] };
        result.push(currentGroup);
      }
    }

    return result;
  }, [displaySubtitles]);

  if (subtitles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <p className="text-sm">아직 자막이 없습니다</p>
      </div>
    );
  }

  if (searchQuery && displaySubtitles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-sm">&quot;{searchQuery}&quot;에 대한 검색 결과가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {groups.map((group, groupIdx) => (
        <div key={groupIdx} className="py-1">
          {group.items.map((subtitle) => (
            <SubtitleItem
              key={subtitle.id}
              startTime={subtitle.start_time}
              text={subtitle.text}
              speaker={subtitle.speaker}
              isCurrent={false}
              highlightQuery={searchQuery}
              onClick={onSubtitleClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
