// @TASK T1.5 - 자막 타임라인 (인라인 편집 기능 추가)
// @SPEC docs/planning/06-tasks.md#t15

'use client';

import { useRef, useEffect, useState } from 'react';
import { cn, formatTimeLong } from '@/lib/utils';
import { SubtitleEditor } from './SubtitleEditor';

export interface TimelineSubtitle {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  speaker?: number | null; // 화자 번호
  isEdited?: boolean;
  isInterim?: boolean; // 중간 결과 여부
}

// 화자별 스타일 (의회 회의록 스타일)
const SPEAKER_STYLES = [
  { symbol: '●', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-l-blue-500' },
  { symbol: '○', color: 'text-green-700', bg: 'bg-green-50', border: 'border-l-green-500' },
  { symbol: '◆', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-l-purple-500' },
  { symbol: '◇', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-l-orange-500' },
  { symbol: '■', color: 'text-pink-700', bg: 'bg-pink-50', border: 'border-l-pink-500' },
];

// 텍스트에서 화자 이름 추출 시도 (자기소개 패턴)
// 예: "안양 출신 김재훈 위원입니다", "미래평생교육국장 오광석입니다"
function extractSpeakerName(text: string): string | null {
  // "~입니다" 패턴에서 이름 추출
  const patterns = [
    /([가-힣]+\s*위원)입니다/,
    /([가-힣]+\s*위원장)입니다/,
    /([가-힣]+\s*국장\s*[가-힣]+)입니다/,
    /([가-힣]+\s*의원)입니다/,
    /([가-힣]+\s*과장\s*[가-힣]+)입니다/,
    /출신\s*([가-힣]+\s*위원)입니다/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

// 문장 단위로 줄바꿈 추가
function formatWithLineBreaks(text: string): string[] {
  // 마침표, 물음표, 느낌표 뒤에 줄바꿈
  return text
    .split(/(?<=[.?!。？！])\s*/)
    .filter(s => s.trim());
}

interface SubtitleTimelineProps {
  subtitles: TimelineSubtitle[];
  currentTimeMs: number;
  currentTranscript?: string; // 현재 실시간 인식 중인 텍스트
  speakerNames?: Map<number, string>; // 화자 번호 -> 이름 매핑
  onSeek?: (timeMs: number) => void;
  onSubtitleUpdate?: (id: string, newText: string) => Promise<void>;
  onSpeakerNameUpdate?: (speaker: number, name: string) => void; // 화자 이름 업데이트
  className?: string;
}

export function SubtitleTimeline({
  subtitles,
  currentTimeMs,
  currentTranscript,
  speakerNames = new Map(),
  onSeek,
  onSubtitleUpdate,
  onSpeakerNameUpdate,
  className,
}: SubtitleTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localSpeakerNames, setLocalSpeakerNames] = useState<Map<number, string>>(new Map(speakerNames));

  // 역순으로 정렬 (최신 자막이 맨 위)
  const reversedSubtitles = [...subtitles].reverse();

  // 화자 이름 자동 감지 (자막 텍스트에서)
  useEffect(() => {
    subtitles.forEach(subtitle => {
      if (subtitle.speaker !== undefined && subtitle.speaker !== null) {
        const detectedName = extractSpeakerName(subtitle.text);
        if (detectedName && !localSpeakerNames.has(subtitle.speaker)) {
          setLocalSpeakerNames(prev => {
            const updated = new Map(prev);
            updated.set(subtitle.speaker!, detectedName);
            return updated;
          });
          onSpeakerNameUpdate?.(subtitle.speaker, detectedName);
        }
      }
    });
  }, [subtitles, localSpeakerNames, onSpeakerNameUpdate]);

  // 화자 스타일 가져오기
  const getSpeakerStyle = (speaker: number | null | undefined) => {
    if (speaker === null || speaker === undefined) {
      return SPEAKER_STYLES[0];
    }
    return SPEAKER_STYLES[speaker % SPEAKER_STYLES.length];
  };

  // 화자 표시 이름 가져오기
  const getSpeakerDisplayName = (speaker: number | null | undefined) => {
    if (speaker === null || speaker === undefined) return null;
    return localSpeakerNames.get(speaker) || `화자${speaker + 1}`;
  };

  // 현재 활성 자막 찾기 (역순 배열에서)
  const activeIndex = reversedSubtitles.findIndex(
    (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
  );

  // 활성 자막으로 스크롤 (맨 위로 스크롤하지 않음 - 새 자막 추가 시)
  useEffect(() => {
    if (activeItemRef.current && containerRef.current) {
      const container = containerRef.current;
      const item = activeItemRef.current;

      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();

      // 아이템이 컨테이너 밖에 있으면 스크롤
      if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);

  // 자막 저장 핸들러
  const handleSave = async (id: string, newText: string) => {
    if (onSubtitleUpdate) {
      await onSubtitleUpdate(id, newText);
    }
    setEditingId(null);
  };

  // 편집 취소 핸들러
  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // 자막 클릭 핸들러
  const handleSubtitleClick = (subtitle: TimelineSubtitle) => {
    // 더블 클릭으로 편집 모드 진입
    if (editingId === subtitle.id) {
      return; // 이미 편집 중이면 무시
    }
    // 첫 클릭은 시크
    if (onSeek) {
      onSeek(subtitle.startTimeMs);
    }
  };

  // 더블 클릭으로 편집 모드
  const handleSubtitleDoubleClick = (subtitle: TimelineSubtitle) => {
    if (onSubtitleUpdate) {
      setEditingId(subtitle.id);
    }
  };

  if (subtitles.length === 0 && !currentTranscript) {
    return (
      <div className={cn('flex items-center justify-center h-full text-gray-500', className)}>
        <div className="text-center">
          <p>자막이 없습니다</p>
          <p className="text-xs mt-1">자막 시작 버튼을 눌러주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full overflow-y-auto border border-gray-200 rounded-lg',
        className
      )}
    >
      <div className="divide-y divide-gray-100">
        {/* 실시간 인식 중인 텍스트 (맨 위에 표시) */}
        {currentTranscript && (
          <div className="p-3 bg-yellow-50 border-l-4 border-l-yellow-400">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
              <span className="text-xs text-yellow-700 font-medium">
                실시간 인식 중...
              </span>
            </div>
            <div className="text-sm text-yellow-800 space-y-1">
              {formatWithLineBreaks(currentTranscript).map((sentence, idx) => (
                <p key={idx} className="leading-relaxed">
                  {sentence}
                </p>
              ))}
            </div>
          </div>
        )}

        {reversedSubtitles.map((subtitle, index) => {
          const isActive = index === activeIndex;
          const isEditing = editingId === subtitle.id;
          const speakerStyle = getSpeakerStyle(subtitle.speaker);
          const speakerName = getSpeakerDisplayName(subtitle.speaker);

          return (
            <div
              key={subtitle.id}
              ref={isActive ? activeItemRef : null}
              className={cn(
                'p-3 transition-colors border-l-4',
                !isEditing && 'cursor-pointer hover:bg-gray-50',
                isActive ? 'bg-blue-50 border-l-blue-500' : speakerStyle.border,
                subtitle.isEdited && !isEditing && 'bg-yellow-50'
              )}
            >
              {/* 타임스탬프 + 화자 이름 (회의록 스타일) */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400 font-mono">
                  [{formatTimeLong(subtitle.startTimeMs)}]
                </span>
                {speakerName && (
                  <span className={cn('text-sm font-bold', speakerStyle.color)}>
                    {speakerStyle.symbol} {speakerName}
                  </span>
                )}
                {subtitle.isEdited && (
                  <span className="text-xs text-yellow-600 bg-yellow-100 px-1 rounded">
                    수정됨
                  </span>
                )}
                {!isEditing && onSubtitleUpdate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(subtitle.id);
                    }}
                    className="ml-auto text-xs text-blue-600 hover:text-blue-700 hover:underline"
                    aria-label="자막 편집"
                  >
                    편집
                  </button>
                )}
              </div>

              {isEditing ? (
                <SubtitleEditor
                  id={subtitle.id}
                  text={subtitle.text}
                  isEdited={subtitle.isEdited}
                  onSave={handleSave}
                  onCancel={handleCancelEdit}
                />
              ) : (
                <div
                  onClick={() => handleSubtitleClick(subtitle)}
                  onDoubleClick={() => handleSubtitleDoubleClick(subtitle)}
                  className="text-sm text-gray-700 space-y-1 pl-4"
                >
                  {formatWithLineBreaks(subtitle.text).map((sentence, idx) => (
                    <p key={idx} className="leading-relaxed">
                      {sentence}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
