'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import Mp4Player from '../../../../components/Mp4Player';
import TranscriptStatusBadge from '../../../../components/TranscriptStatusBadge';
import VideoControls from '../../../../components/VideoControls';
import { useBreadcrumb } from '../../../../contexts/BreadcrumbContext';
import { apiClient, updateSubtitlesBatch } from '../../../../lib/api';

import type { SubtitleBatchItem } from '../../../../lib/api';
import type { MeetingType, SubtitleType } from '../../../../types';

interface SpeakerPageProps {
  params: { id: string };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const SPEAKER_OPTIONS = [
  { value: '', label: '(미지정)' },
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

export default function SpeakerManagementPage({ params }: SpeakerPageProps) {
  const router = useRouter();
  const { setTitle } = useBreadcrumb();
  const { id } = params;

  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [editableSubtitles, setEditableSubtitles] = useState<SubtitleType[]>([]);
  const [originalSubtitles, setOriginalSubtitles] = useState<SubtitleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [speakerFilter, setSpeakerFilter] = useState('all');
  const [bulkSpeaker, setBulkSpeaker] = useState('');

  const changesMap = useRef<Map<string, { speaker: string }>>(new Map());

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [meetingData, subtitleResponse] = await Promise.all([
          apiClient<MeetingType>(`/api/meetings/${id}`),
          apiClient<{ items: SubtitleType[] }>(`/api/meetings/${id}/subtitles?limit=1000`),
        ]);

        setMeeting(meetingData);
        setTitle(meetingData.title);

        const items = subtitleResponse.items ?? [];
        setSubtitles(items);
        setEditableSubtitles(items);
        setOriginalSubtitles(items);

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

  const hasChanges = changesMap.current.size > 0;

  const currentSubtitleIndex = useMemo(
    () =>
      editableSubtitles.findIndex(
        (subtitle) => currentTime >= subtitle.start_time && currentTime < subtitle.end_time
      ),
    [currentTime, editableSubtitles]
  );

  const availableSpeakers = useMemo(() => {
    const speakerSet = new Set<string>();
    subtitles.forEach((subtitle) => {
      const speaker = subtitle.speaker?.trim();
      if (speaker) {
        speakerSet.add(speaker);
      }
    });

    const dynamicOptions = Array.from(speakerSet)
      .sort((a, b) => a.localeCompare(b, 'ko-KR'))
      .map((speaker) => ({ value: speaker, label: speaker }));

    return [{ value: 'all', label: '전체' }, { value: 'unassigned', label: '미지정만' }, ...dynamicOptions];
  }, [subtitles]);

  const filteredSubtitles = useMemo(() => {
    if (speakerFilter === 'all') {
      return editableSubtitles;
    }

    if (speakerFilter === 'unassigned') {
      return editableSubtitles.filter((subtitle) => !subtitle.speaker);
    }

    return editableSubtitles.filter((subtitle) => subtitle.speaker === speakerFilter);
  }, [editableSubtitles, speakerFilter]);

  const unassignedCount = editableSubtitles.filter((subtitle) => !subtitle.speaker).length;

  useEffect(() => {
    if (autoScroll && currentSubtitleIndex >= 0) {
      const currentSubtitle = editableSubtitles[currentSubtitleIndex];
      if (!currentSubtitle) return;

      const element = subtitleRefs.current.get(currentSubtitle.id);
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [autoScroll, currentSubtitleIndex, editableSubtitles]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  }, []);

  const handleSeek = useCallback((startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  }, []);

  const handleSpeakerChange = useCallback((subtitleId: string, newSpeaker: string) => {
    const normalizedSpeaker = newSpeaker === '' ? '' : newSpeaker;

    setEditableSubtitles((prev) =>
      prev.map((subtitle) =>
        subtitle.id === subtitleId
          ? { ...subtitle, speaker: normalizedSpeaker }
          : subtitle
      )
    );

    const original = originalSubtitles.find((subtitle) => subtitle.id === subtitleId);
    if (original && (original.speaker ?? '') !== normalizedSpeaker) {
      changesMap.current.set(subtitleId, { speaker: normalizedSpeaker });
      return;
    }

    changesMap.current.delete(subtitleId);
  }, [originalSubtitles]);

  const handleBulkSpeakerApply = async () => {
    if (!bulkSpeaker || filteredSubtitles.length === 0) return;

      const targetSpeaker = bulkSpeaker;

    const updates = filteredSubtitles.filter((subtitle) => {
      if (subtitle.speaker === targetSpeaker) {
        return false;
      }
      const original = originalSubtitles.find((item) => item.id === subtitle.id);
      return !!original && (original.speaker ?? null) !== targetSpeaker;
    });

    if (updates.length === 0) {
      return;
    }

    setEditableSubtitles((prev) =>
      prev.map((subtitle) => {
        const changed = updates.find((candidate) => candidate.id === subtitle.id);
        if (!changed) {
          return subtitle;
        }
        return { ...subtitle, speaker: targetSpeaker };
      })
    );

    updates.forEach((subtitle) => {
      changesMap.current.set(subtitle.id, { speaker: targetSpeaker });
    });
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    const items: SubtitleBatchItem[] = Array.from(changesMap.current.entries()).map(
      ([subtitleId, changes]) => ({ id: subtitleId, speaker: changes.speaker })
    );

    try {
      setIsSaving(true);
      await updateSubtitlesBatch(id, items);

      setOriginalSubtitles([...editableSubtitles]);
      changesMap.current.clear();
      alert('화자 변경이 저장되었습니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      alert(`저장 실패: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      const confirmed = window.confirm('저장하지 않은 화자 변경사항이 있습니다. 이동할까요?');
      if (!confirmed) return;
    }
    router.push(`/vod/${id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">회의 정보를 불러오지 못했습니다.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-light"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </button>
          <span className="text-sm text-gray-500">|</span>
          <Link href={`/vod/${id}/speaker`} className="text-sm text-gray-600">
            화자 관리
          </Link>
          <span className="text-sm text-gray-400">•</span>
          <span className="text-sm text-gray-900 font-medium truncate">{meeting.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <TranscriptStatusBadge
            meetingId={meeting.id}
            status={meeting.transcript_status || 'draft'}
            editable
            onStatusChange={(newStatus) =>
              setMeeting((prev) => (prev ? { ...prev, transcript_status: newStatus } : prev))
            }
          />
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              hasChanges && !isSaving
                ? 'bg-primary text-white hover:bg-primary-light'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSaving ? '저장 중...' : `변경 저장${hasChanges ? ` (${changesMap.current.size})` : ''}`}
          </button>
          <Link
            href={`/vod/${id}/edit`}
            className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            교정/편집으로 이동
          </Link>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        <div className="w-full lg:w-3/5 bg-black flex items-center justify-center">
          <div className="w-full">
            <Mp4Player
              vodUrl={meeting.vod_url || ''}
              videoRef={videoRef}
              onTimeUpdate={handleTimeUpdate}
              onError={(err) => console.error('Video Error:', err)}
            />
            <VideoControls videoRef={videoRef} currentTime={currentTime} duration={duration} />
          </div>
        </div>

        <div className="w-full lg:w-2/5 flex flex-col min-h-0">
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">필터</label>
              <select
                value={speakerFilter}
                onChange={(e) => setSpeakerFilter(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              >
                {availableSpeakers.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500">미지정 {unassignedCount}개</p>
          </div>

          <div className="mb-2 flex items-center gap-2">
            <select
              value={bulkSpeaker}
              onChange={(e) => setBulkSpeaker(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm flex-1"
            >
              <option value="">일괄 지정할 화자 선택</option>
              {SPEAKER_OPTIONS.slice(1).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkSpeakerApply}
              disabled={!bulkSpeaker}
              className="px-3 py-1.5 rounded-md text-sm text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              선택 항목 일괄 지정
            </button>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoScroll ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoScroll ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs text-gray-600">자동 스크롤</span>
          </div>

          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md bg-white">
            {filteredSubtitles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">표시할 자막이 없습니다.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredSubtitles.map((subtitle) => {
                  const isActive = subtitle.id === editableSubtitles[currentSubtitleIndex]?.id;

                  return (
                    <div
                      key={subtitle.id}
                      ref={(element) => {
                        if (element) {
                          subtitleRefs.current.set(subtitle.id, element);
                        } else {
                          subtitleRefs.current.delete(subtitle.id);
                        }
                      }}
                      className={`p-3 transition-colors ${
                        isActive
                          ? 'bg-blue-50 border-l-4 border-primary'
                          : 'bg-white hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <button
                        onClick={() => handleSeek(subtitle.start_time)}
                        className="text-xs text-gray-500 hover:text-primary transition-colors"
                      >
                        {formatTime(subtitle.start_time)} ~ {formatTime(subtitle.end_time)}
                      </button>

                      <select
                        value={subtitle.speaker || ''}
                        onChange={(event) =>
                          handleSpeakerChange(subtitle.id, event.target.value)
                        }
                        className="w-full mt-2 px-2 py-1 text-sm border border-gray-300 rounded-md"
                      >
                        {SPEAKER_OPTIONS.map((option) => (
                          <option key={`${subtitle.id}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <p className="mt-2 text-sm text-gray-900 truncate">{subtitle.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-500">총 {editableSubtitles.length}개 / 표시 {filteredSubtitles.length}개</div>
        </div>
      </div>
    </div>
  );
}
