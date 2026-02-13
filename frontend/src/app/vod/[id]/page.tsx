'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import MeetingInfoPanel from '../../../components/MeetingInfoPanel';
import MeetingSummaryPanel from '../../../components/MeetingSummaryPanel';
import Mp4Player from '../../../components/Mp4Player';
import SubtitlePanel from '../../../components/SubtitlePanel';
import TranscriptExportButton from '../../../components/TranscriptExportButton';
import TranscriptStatusBadge from '../../../components/TranscriptStatusBadge';
import VideoControls from '../../../components/VideoControls';
import { useBreadcrumb } from '../../../contexts/BreadcrumbContext';
import { apiClient, ApiError, startSttProcessing, getSttStatus, getVerificationStats } from '../../../lib/api';

import type { SttStatusResponse } from '../../../lib/api';
import type { MeetingType, SubtitleType, VerificationStatsType } from '../../../types';

interface VodViewerPageProps {
  params: { id: string };
}

export default function VodViewerPage({ params }: VodViewerPageProps) {
  const router = useRouter();
  const { setTitle } = useBreadcrumb();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // STT 처리 상태
  const [sttStatus, setSttStatus] = useState<SttStatusResponse | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 사이드바 탭 상태
  const [activeTab, setActiveTab] = useState<'subtitles' | 'summary'>('subtitles');
  const [verificationStats, setVerificationStats] = useState<VerificationStatsType | null>(null);

  const { id } = params;

  // 자막 데이터 리로드
  const reloadSubtitles = useCallback(async () => {
    try {
      const subtitlesResponse = await apiClient<{ items: SubtitleType[] }>(
        `/api/meetings/${id}/subtitles`
      );
      setSubtitles(subtitlesResponse.items ?? []);
    } catch {
      // 자막 리로드 실패는 조용히 무시
    }
  }, [id]);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [meetingData, subtitlesResponse] = await Promise.all([
          apiClient<MeetingType>(`/api/meetings/${id}`),
          apiClient<{ items: SubtitleType[] }>(`/api/meetings/${id}/subtitles`),
        ]);

        setMeeting(meetingData);
        setTitle(meetingData.title);
        setSubtitles(subtitlesResponse.items ?? []);
        if (meetingData.duration_seconds) {
          setDuration(meetingData.duration_seconds);
        }

        // 검증 통계 로드 (실패해도 무시)
        try {
          const stats = await getVerificationStats(id);
          setVerificationStats(stats);
        } catch {
          // 검증 통계 로드 실패는 무시
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id, setTitle]);

  // 폴링 정리
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // STT 진행률 폴링 시작
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const status = await getSttStatus(id);
        setSttStatus(status);

        if (status.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          // 완료 시 자막 리로드
          await reloadSubtitles();
        } else if (status.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setSttError(status.error || '알 수 없는 오류가 발생했습니다.');
        }
      } catch {
        // 폴링 에러는 조용히 무시 (다음 폴링에서 재시도)
      }
    }, 2000);
  }, [id, reloadSubtitles]);

  // 페이지 로드 시 STT 상태 자동 확인 (자막이 없고 vod_url이 있을 때)
  useEffect(() => {
    if (isLoading || subtitles.length > 0 || !meeting?.vod_url) return;

    async function checkSttStatus() {
      try {
        const status = await getSttStatus(id);
        if (status.status === 'running' || status.status === 'pending') {
          setSttStatus(status);
          startPolling();
        }
      } catch {
        // 상태 확인 실패는 무시 (아직 시작 안 한 경우)
      }
    }

    checkSttStatus();
  }, [id, isLoading, subtitles.length, meeting?.vod_url, startPolling]);

  // 자막 생성 시작
  const handleStartStt = async () => {
    try {
      setSttError(null);
      const result = await startSttProcessing(id);
      setSttStatus({
        meeting_id: id,
        status: 'running',
        progress: 0,
        message: result.message,
        error: null,
        task_id: result.task_id,
      });
      startPolling();
    } catch (err) {
      // 409 = 이미 처리 중 → 에러 대신 폴링 시작
      if (err instanceof ApiError && err.status === 409) {
        setSttError(null);
        setSttStatus({
          meeting_id: id,
          status: 'running',
          progress: 0,
          message: '진행 상태 확인 중...',
          error: null,
        });
        startPolling();
        return;
      }
      if (err instanceof Error) {
        setSttError(err.message);
      } else {
        setSttError('STT 처리 시작에 실패했습니다.');
      }
    }
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSubtitleClick = (startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  };

  const handleHomeClick = () => {
    router.push('/');
  };

  const isSttRunning =
    sttStatus?.status === 'pending' || sttStatus?.status === 'running';
  const showSttButton =
    !isLoading && subtitles.length === 0 && !isSttRunning && meeting?.vod_url;

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="page-loading" className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !meeting) {
    return (
      <div data-testid="page-error" className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">오류가 발생했습니다.</p>
          <button
            onClick={handleHomeClick}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-light transition-colors"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="vod-viewer-page" className="flex flex-col h-full">
      <main
        data-testid="vod-layout"
        className="flex-1 flex flex-col lg:flex-row gap-4 p-4"
      >
        {/* Main Content - Video Player (70% on desktop) */}
        <div
          data-testid="main-content"
          className="w-full lg:w-[70%]"
        >
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

        {/* Sidebar - Subtitle Panel (30% on desktop) */}
        <div
          data-testid="sidebar"
          className="w-full lg:w-[30%] h-[50vh] lg:h-auto flex flex-col"
        >
          {/* 회의록 상태 배지 */}
          <div className="mb-2 flex items-center gap-2">
            <TranscriptStatusBadge
              meetingId={meeting.id}
              status={meeting.transcript_status || 'draft'}
              editable
              onStatusChange={(newStatus) =>
                setMeeting((prev) => prev ? { ...prev, transcript_status: newStatus } : prev)
              }
            />
          </div>

          {/* 탭 전환 (자막 | 요약) */}
          <div className="flex border-b border-gray-200 mb-2">
            <button
              onClick={() => setActiveTab('subtitles')}
              className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
                activeTab === 'subtitles'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              자막
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
                activeTab === 'summary'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              AI 요약
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {activeTab === 'subtitles' ? (
              <SubtitlePanel
                subtitles={subtitles}
                currentTime={currentTime}
                autoScroll={false}
                onSubtitleClick={handleSubtitleClick}
                isLoading={isLoading}
              />
            ) : (
              <div className="h-full overflow-y-auto p-2">
                <MeetingSummaryPanel meetingId={id} />
              </div>
            )}
          </div>

          {/* STT 자막 생성 영역 */}
          {(showSttButton || isSttRunning || sttError) && (
            <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
              {/* 자막 생성 버튼 */}
              {showSttButton && !sttError && (
                <button
                  data-testid="stt-start-button"
                  onClick={handleStartStt}
                  className="w-full py-2.5 px-4 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-light transition-colors"
                >
                  자막 생성 (AI)
                </button>
              )}

              {/* 진행률 표시 */}
              {isSttRunning && sttStatus && (
                <div data-testid="stt-progress">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      자막 생성 중...
                    </span>
                    <span className="text-sm text-gray-500">
                      {Math.round(sttStatus.progress * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(sttStatus.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {sttStatus.message}
                  </p>
                </div>
              )}

              {/* 완료 메시지 */}
              {sttStatus?.status === 'completed' && subtitles.length > 0 && (
                <p className="text-sm text-green-600 font-medium">
                  자막 생성 완료 ({subtitles.length}개)
                </p>
              )}

              {/* 에러 메시지 */}
              {sttError && (
                <div data-testid="stt-error">
                  <p className="text-sm text-red-600 mb-2">{sttError}</p>
                  <button
                    onClick={handleStartStt}
                    className="w-full py-2 px-4 bg-red-50 text-red-700 text-sm font-medium rounded-md border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    다시 시도
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 자막 편집 + 검증 버튼 */}
          {subtitles.length > 0 && (
           <div className="mt-2 flex gap-2">
              <Link
                href={`/vod/${id}/speaker`}
                className="flex-1 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors text-center"
              >
                화자 관리
              </Link>
              <Link
                href={`/vod/${id}/edit`}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
              >
                자막 편집
              </Link>
              <Link
                href={`/vod/${id}/verify`}
                className="flex-1 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors text-center"
              >
                자막 검증
                {verificationStats && (
                  <span className="ml-1 text-xs">
                    ({Math.round(verificationStats.progress * 100)}%)
                  </span>
                )}
              </Link>
            </div>
          )}

          <TranscriptExportButton meetingId={id} meetingTitle={meeting.title} />

          {/* 회의 정보 패널 */}
          <div className="mt-2">
            <MeetingInfoPanel
              meeting={meeting}
              onMeetingUpdate={(updated) => setMeeting(updated)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
