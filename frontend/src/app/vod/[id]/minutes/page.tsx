'use client';

import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useBreadcrumb } from '../../../../contexts/BreadcrumbContext';
import { apiClient } from '../../../../lib/api';

import type { MeetingSummaryType, MeetingType, SubtitleType } from '../../../../types';

interface MinutesPageProps {
  params: { id: string };
}

/**
 * 시간 포맷: HH:MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 화자별로 자막을 그룹화
 */
function groupBySpeaker(subtitles: SubtitleType[]): Array<{
  speaker: string;
  texts: string[];
  startTime: number;
  endTime: number;
}> {
  const groups: Array<{
    speaker: string;
    texts: string[];
    startTime: number;
    endTime: number;
  }> = [];

  let current: (typeof groups)[0] | null = null;

  for (const sub of subtitles) {
    const speaker = sub.speaker || '(미지정)';
    if (current && current.speaker === speaker) {
      current.texts.push(sub.text);
      current.endTime = sub.end_time;
    } else {
      if (current) groups.push(current);
      current = {
        speaker,
        texts: [sub.text],
        startTime: sub.start_time,
        endTime: sub.end_time,
      };
    }
  }
  if (current) groups.push(current);

  return groups;
}

export default function MinutesPage({ params }: MinutesPageProps) {
  const router = useRouter();
  const { setTitle } = useBreadcrumb();
  const { id } = params;

  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [summary, setSummary] = useState<MeetingSummaryType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'minutes' | 'summary' | 'agenda'>('minutes');

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
        setSubtitles(subtitlesResponse.items ?? []);

        // 기존 요약 로드 시도
        try {
          const summaryData = await apiClient<MeetingSummaryType>(
            `/api/meetings/${id}/summary`
          );
          setSummary(summaryData);
        } catch {
          // 요약이 없을 수 있음
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id, setTitle]);

  // AI 요약 생성
  const handleGenerateSummary = async () => {
    try {
      setIsSummaryLoading(true);
      const summaryData = await apiClient<MeetingSummaryType>(
        `/api/meetings/${id}/summary`,
        { method: 'POST' }
      );
      setSummary(summaryData);
      setActiveTab('summary');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'AI 요약 생성에 실패했습니다.');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // PDF 내보내기 (회의록 형식)
  const handleExportPdf = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/meetings/${id}/export?format=official`
      );
      if (!response.ok) throw new Error('내보내기 실패');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `회의록_${meeting?.title || id}.md`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '내보내기에 실패했습니다.');
    }
  };

  const speakerGroups = groupBySpeaker(subtitles);

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
    <div data-testid="minutes-page" className="flex flex-col h-full">
      {/* 상단 툴바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/vod/${id}`}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">회의록 작성</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="generate-summary-button"
            onClick={handleGenerateSummary}
            disabled={isSummaryLoading || subtitles.length === 0}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isSummaryLoading || subtitles.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSummaryLoading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                AI 요약 생성 중...
              </span>
            ) : (
              'AI 요약 생성'
            )}
          </button>
          <button
            data-testid="export-pdf-button"
            onClick={handleExportPdf}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
          >
            PDF 내보내기
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-4">
          {[
            { key: 'minutes' as const, label: '회의록' },
            { key: 'summary' as const, label: 'AI 요약' },
            { key: 'agenda' as const, label: '안건별 정리' },
          ].map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 회의 정보 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">{meeting.title}</h2>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>일시: {meeting.meeting_date}</span>
            {meeting.committee && <span>위원회: {meeting.committee}</span>}
            <span>자막 수: {subtitles.length}개</span>
          </div>
        </div>

        {/* 회의록 탭 */}
        {activeTab === 'minutes' && (
          <div data-testid="minutes-content" className="bg-white border border-gray-200 rounded-lg p-6">
            {subtitles.length === 0 ? (
              <p className="text-gray-500 text-center py-8">자막 데이터가 없습니다. STT를 먼저 실행해주세요.</p>
            ) : (
              <div className="space-y-4">
                {speakerGroups.map((group, index) => (
                  <div key={index} className="border-b border-gray-100 pb-3 last:border-b-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-primary">{group.speaker}</span>
                      <span className="text-xs text-gray-400">
                        {formatTime(group.startTime)} ~ {formatTime(group.endTime)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {group.texts.join(' ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI 요약 탭 */}
        {activeTab === 'summary' && (
          <div data-testid="summary-content" className="bg-white border border-gray-200 rounded-lg p-6">
            {summary ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">회의 요약</h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {summary.summary_text}
                  </p>
                </div>
                {summary.key_decisions && summary.key_decisions.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">주요 결정사항</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.key_decisions.map((decision, i) => (
                        <li key={i} className="text-sm text-gray-700">{decision}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.action_items && summary.action_items.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">후속 조치</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.action_items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">AI 요약이 아직 생성되지 않았습니다.</p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isSummaryLoading || subtitles.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  AI 요약 생성하기
                </button>
              </div>
            )}
          </div>
        )}

        {/* 안건별 정리 탭 */}
        {activeTab === 'agenda' && (
          <div data-testid="agenda-content" className="bg-white border border-gray-200 rounded-lg p-6">
            {summary?.agenda_summaries && summary.agenda_summaries.length > 0 ? (
              <div className="space-y-6">
                {summary.agenda_summaries.map((agenda, index) => (
                  <div key={index} className="border-b border-gray-100 pb-4 last:border-b-0">
                    <h3 className="text-base font-semibold text-gray-900 mb-2">
                      {agenda.order_num}. {agenda.title}
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {agenda.summary}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">안건별 정리가 없습니다. AI 요약을 먼저 생성해주세요.</p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isSummaryLoading || subtitles.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  AI 요약 생성하기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
