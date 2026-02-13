'use client';

import React, { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import Mp4Player from '../../../../components/Mp4Player';
import PiiMaskButton from '../../../../components/PiiMaskButton';
import ProofreadingToolbar from '../../../../components/ProofreadingToolbar';
import SubtitleHistoryModal from '../../../../components/SubtitleHistoryModal';
import TranscriptStatusBadge from '../../../../components/TranscriptStatusBadge';
import VideoControls from '../../../../components/VideoControls';
import { useBreadcrumb } from '../../../../contexts/BreadcrumbContext';
import { apiClient, updateSubtitlesBatch } from '../../../../lib/api';

import type { SubtitleBatchItem } from '../../../../lib/api';
import type { MeetingType, SubtitleType } from '../../../../types';

interface EditPageProps {
  params: { id: string };
}

/**
 * 시간 포맷: MM:SS
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 화자 옵션
 */
const SPEAKER_OPTIONS = [
  { value: '', label: '(화자 미지정)' },
  { value: '화자 1', label: '화자 1' },
  { value: '화자 2', label: '화자 2' },
  { value: '화자 3', label: '화자 3' },
  { value: '화자 4', label: '화자 4' },
  { value: '화자 5', label: '화자 5' },
  { value: '화자 6', label: '화자 6' },
  { value: '화자 7', label: '화자 7' },
  { value: '화자 8', label: '화자 8' },
  { value: '화자 9', label: '화자 9' },
  { value: '화자 10', label: '화자 10' },
];

export default function SubtitleEditPage({ params }: EditPageProps) {
  const router = useRouter();
  const { setTitle } = useBreadcrumb();
  const { id } = params;

  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [originalSubtitles, setOriginalSubtitles] = useState<SubtitleType[]>([]);
  const [editedSubtitles, setEditedSubtitles] = useState<SubtitleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [historySubtitleId, setHistorySubtitleId] = useState<string | null>(null);

  // 변경사항 추적
  const changesMap = useRef<Map<string, { text?: string; speaker?: string }>>(
    new Map()
  );

  // 초기 데이터 로드
  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [meetingData, subtitlesResponse] = await Promise.all([
          apiClient<MeetingType>(`/api/meetings/${id}`),
          apiClient<{ items: SubtitleType[] }>(
            `/api/meetings/${id}/subtitles?limit=1000`
          ),
        ]);

        setMeeting(meetingData);
        setTitle(meetingData.title);
        const items = subtitlesResponse.items ?? [];
        setOriginalSubtitles(items);
        setEditedSubtitles(items);

        if (meetingData.duration_seconds) {
          setDuration(meetingData.duration_seconds);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id, setTitle]);

  // 현재 재생 위치에 해당하는 자막 인덱스
  const currentSubtitleIndex = editedSubtitles.findIndex(
    (sub) => currentTime >= sub.start_time && currentTime < sub.end_time
  );

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && currentSubtitleIndex >= 0) {
      const currentSubtitle = editedSubtitles[currentSubtitleIndex];
      if (currentSubtitle) {
        const element = subtitleRefs.current.get(currentSubtitle.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentSubtitleIndex, autoScroll, editedSubtitles]);

  // 비디오 시간 업데이트
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  // 자막 시간 클릭 → 해당 시점으로 비디오 이동
  const handleSubtitleTimeClick = (startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  };

  // 텍스트 수정
  const handleTextChange = (subtitleId: string, newText: string) => {
    setEditedSubtitles((prev) =>
      prev.map((sub) => (sub.id === subtitleId ? { ...sub, text: newText } : sub))
    );

    // 변경사항 추적
    const original = originalSubtitles.find((s) => s.id === subtitleId);
    if (original && original.text !== newText) {
      const current = changesMap.current.get(subtitleId) || {};
      changesMap.current.set(subtitleId, { ...current, text: newText });
    } else {
      const current = changesMap.current.get(subtitleId);
      if (current) {
        delete current.text;
        if (Object.keys(current).length === 0) {
          changesMap.current.delete(subtitleId);
        }
      }
    }
  };

  // 화자 수정
  const handleSpeakerChange = (subtitleId: string, newSpeaker: string) => {
    const speakerValue = newSpeaker === '' ? null : newSpeaker;

    setEditedSubtitles((prev) =>
      prev.map((sub) =>
        sub.id === subtitleId ? { ...sub, speaker: speakerValue } : sub
      )
    );

    // 변경사항 추적
    const original = originalSubtitles.find((s) => s.id === subtitleId);
    if (original && (original.speaker ?? '') !== newSpeaker) {
      const current = changesMap.current.get(subtitleId) || {};
      changesMap.current.set(subtitleId, { ...current, speaker: newSpeaker });
    } else {
      const current = changesMap.current.get(subtitleId);
      if (current) {
        delete current.speaker;
        if (Object.keys(current).length === 0) {
          changesMap.current.delete(subtitleId);
        }
      }
    }
  };

  // 변경사항 개수
  const changesCount = changesMap.current.size;
  const hasChanges = changesCount > 0;

  // 저장
  const handleSave = async () => {
    if (!hasChanges) return;

    const items: SubtitleBatchItem[] = Array.from(changesMap.current.entries()).map(
      ([subtitleId, changes]) => ({
        id: subtitleId,
        ...changes,
      })
    );

    try {
      setIsSaving(true);
      const response = await updateSubtitlesBatch(id, items);

      // 성공 시 원본 업데이트 및 변경사항 초기화
      setOriginalSubtitles([...editedSubtitles]);
      changesMap.current.clear();

      alert(`저장 완료: ${response.updated}개 항목이 수정되었습니다.`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '저장에 실패했습니다.';
      alert(`저장 실패: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 뒤로 가기
  const handleBack = () => {
    if (hasChanges) {
      const confirmed = window.confirm(
        '저장하지 않은 변경사항이 있습니다. 페이지를 나가시겠습니까?'
      );
      if (!confirmed) return;
    }
    router.back();
  };

  // 로딩
  if (isLoading) {
    return (
      <div
        data-testid="page-loading"
        className="min-h-screen flex items-center justify-center"
      >
        <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // 에러
  if (error || !meeting) {
    return (
      <div
        data-testid="page-error"
        className="min-h-screen flex items-center justify-center"
      >
        <div className="text-center">
          <p className="text-red-600 mb-4">오류가 발생했습니다.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-light transition-colors"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="subtitle-edit-page"
      className="flex flex-col h-full"
    >
      {/* 상단 툴바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            data-testid="back-button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </button>
          <TranscriptStatusBadge
            meetingId={id}
            status={meeting.transcript_status || 'draft'}
            editable
            onStatusChange={(newStatus) =>
              setMeeting((prev) => prev ? { ...prev, transcript_status: newStatus } : prev)
            }
          />
        </div>
        <button
          data-testid="save-button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            hasChanges && !isSaving
              ? 'bg-primary text-white hover:bg-primary-light'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              저장 중...
            </span>
          ) : (
            `저장${hasChanges ? ` (${changesCount})` : ''}`
          )}
        </button>
      </div>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* 좌측: 비디오 플레이어 (60%) */}
        <div className="w-full lg:w-[60%]">
          <Mp4Player
            vodUrl={meeting.vod_url || ''}
            videoRef={videoRef}
            onTimeUpdate={handleTimeUpdate}
            onError={(err) => console.error('Video Error:', err)}
          />
          <VideoControls
            videoRef={videoRef}
            currentTime={currentTime}
            duration={duration}
          />
        </div>

        {/* 우측: 편집 가능한 자막 목록 (40%) */}
        <div className="w-full lg:w-[40%] flex flex-col">
          {/* 자동 스크롤 토글 */}
          <div className="mb-2 flex items-center justify-between bg-white px-4 py-2 border border-gray-200 rounded-md">
            <span className="text-sm text-gray-700">자동 스크롤</span>
            <button
              data-testid="auto-scroll-toggle"
              onClick={() => setAutoScroll((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoScroll ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoScroll ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 교정 도구 */}
          <div className="mb-2 space-y-2">
            <PiiMaskButton
              meetingId={id}
              onMaskApplied={async () => {
                // 마스킹 적용 후 자막 리로드
                try {
                  const resp = await apiClient<{ items: SubtitleType[] }>(
                    `/api/meetings/${id}/subtitles?limit=1000`
                  );
                  const items = resp.items ?? [];
                  setOriginalSubtitles(items);
                  setEditedSubtitles(items);
                  changesMap.current.clear();
                } catch { /* ignore */ }
              }}
            />
            <ProofreadingToolbar
              meetingId={id}
              onCorrectionsApplied={async () => {
                // 교정 적용 후 자막 리로드
                try {
                  const resp = await apiClient<{ items: SubtitleType[] }>(
                    `/api/meetings/${id}/subtitles?limit=1000`
                  );
                  const items = resp.items ?? [];
                  setOriginalSubtitles(items);
                  setEditedSubtitles(items);
                  changesMap.current.clear();
                } catch { /* ignore */ }
              }}
            />
          </div>

          {/* 자막 목록 */}
          <div
            data-testid="subtitle-list"
            className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-md"
          >
            {editedSubtitles.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                자막이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {editedSubtitles.map((subtitle, index) => {
                  const isActive = index === currentSubtitleIndex;

                  return (
                    <div
                      key={subtitle.id}
                      ref={(el) => {
                        if (el) {
                          subtitleRefs.current.set(subtitle.id, el);
                        } else {
                          subtitleRefs.current.delete(subtitle.id);
                        }
                      }}
                      data-testid={`subtitle-item-${index}`}
                      className={`p-4 transition-colors ${
                        isActive
                          ? 'bg-blue-50 border-l-4 border-primary'
                          : 'border-l-4 border-transparent'
                      }`}
                    >
                      {/* 시간 표시 + 이력 아이콘 */}
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          data-testid={`subtitle-time-${index}`}
                          onClick={() => handleSubtitleTimeClick(subtitle.start_time)}
                          className="text-xs text-gray-500 hover:text-primary transition-colors"
                        >
                          {formatTime(subtitle.start_time)} ~{' '}
                          {formatTime(subtitle.end_time)}
                        </button>
                        <button
                          data-testid={`subtitle-history-${index}`}
                          onClick={() => setHistorySubtitleId(subtitle.id)}
                          className="text-gray-400 hover:text-primary transition-colors"
                          title="변경 이력"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>

                      {/* 화자 선택 */}
                      <select
                        data-testid={`subtitle-speaker-${index}`}
                        value={subtitle.speaker ?? ''}
                        onChange={(e) =>
                          handleSpeakerChange(subtitle.id, e.target.value)
                        }
                        className="w-full mb-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      >
                        {SPEAKER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {/* 텍스트 편집 */}
                      <textarea
                        data-testid={`subtitle-text-${index}`}
                        value={subtitle.text}
                        onChange={(e) =>
                          handleTextChange(subtitle.id, e.target.value)
                        }
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 변경 이력 모달 */}
      {historySubtitleId && (
        <SubtitleHistoryModal
          meetingId={id}
          subtitleId={historySubtitleId}
          onClose={() => setHistorySubtitleId(null)}
        />
      )}
    </div>
  );
}
