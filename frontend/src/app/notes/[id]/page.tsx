'use client';

import { useState, useCallback, useRef } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import useSWR from 'swr';

import Badge from '@/components/Badge';
import Header from '@/components/Header';
import Mp4Player from '@/components/Mp4Player';
import SearchInput from '@/components/SearchInput';
import TranscriptView from '@/components/TranscriptView';
import VideoControls from '@/components/VideoControls';
import { apiClient } from '@/lib/api';
import type { MeetingType, SubtitleType } from '@/types';

type MutableVideoRef = React.MutableRefObject<HTMLVideoElement | null>;

interface SubtitleListResponse {
  items: SubtitleType[];
  total: number;
  limit: number;
  offset: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export default function NoteDetailPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const videoRef = useRef<HTMLVideoElement | null>(null) as MutableVideoRef;

  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // 회의 정보 조회
  const { data: meeting, isLoading: meetingLoading } = useSWR<MeetingType>(
    `/api/meetings/${meetingId}`,
    (url: string) => apiClient<MeetingType>(url),
    { revalidateOnFocus: false }
  );

  // 자막 조회 (전체)
  const { data: subtitleData, isLoading: subtitlesLoading } = useSWR<SubtitleListResponse>(
    `/api/meetings/${meetingId}/subtitles?limit=1000`,
    (url: string) => apiClient<SubtitleListResponse>(url),
    { revalidateOnFocus: false }
  );

  const subtitles = subtitleData?.items ?? [];

  // Mp4Player의 onTimeUpdate 콜백으로 시간 추적
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // 비디오 로드 완료 시 duration 설정
  const handleReady = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  }, [videoRef]);

  const handleSubtitleClick = useCallback((startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  }, [videoRef]);

  // 현재 자막 하이라이트
  const currentSubtitle = subtitles.find(
    (s) => currentTime >= s.start_time && currentTime < s.end_time
  );

  if (meetingLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded w-1/4" />
            <div className="h-96 bg-gray-200 rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8 text-center">
          <p className="text-gray-500 text-lg">회의를 찾을 수 없습니다</p>
          <Link href="/notes" className="text-primary mt-4 inline-block">
            회의록 목록으로 돌아가기
          </Link>
        </main>
      </div>
    );
  }

  const hasVideo = !!meeting.vod_url;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm">
          <Link href="/notes" className="text-gray-500 hover:text-primary transition-colors">
            회의록
          </Link>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-gray-900">{meeting.title}</span>
        </nav>

        {/* Meeting Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{meeting.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{formatDate(meeting.meeting_date)}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <span>자막 {subtitles.length}개</span>
                {meeting.duration_seconds && (
                  <span>{formatDuration(meeting.duration_seconds)}</span>
                )}
              </div>
            </div>
            <Badge variant={meeting.status === 'live' ? 'live' : meeting.status === 'ended' ? 'success' : 'secondary'}>
              {meeting.status === 'live' ? 'LIVE' : meeting.status === 'ended' ? '완료' : meeting.status}
            </Badge>
          </div>
        </div>

        {/* Content Layout */}
        <div className={`flex flex-col ${hasVideo ? 'lg:flex-row' : ''} gap-6`}>
          {/* Video Player (if VOD exists) */}
          {hasVideo && (
            <div className="w-full lg:w-[60%] space-y-2">
              <Mp4Player
                vodUrl={meeting.vod_url!}
                videoRef={videoRef}
                onTimeUpdate={handleTimeUpdate}
                onReady={handleReady}
              />
              <VideoControls
                videoRef={videoRef}
                currentTime={currentTime}
                duration={duration}
              />

              {/* 현재 자막 오버레이 */}
              {currentSubtitle && (
                <div className="bg-gray-900 text-white px-4 py-3 rounded-lg text-center">
                  <p className="text-sm leading-relaxed">{currentSubtitle.text}</p>
                </div>
              )}
            </div>
          )}

          {/* Transcript */}
          <div className={`${hasVideo ? 'w-full lg:w-[40%]' : 'w-full'}`}>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Transcript Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">회의록 전문</h2>
                  <span className="text-sm text-gray-500">{subtitles.length}건</span>
                </div>
                <SearchInput
                  onSearch={setSearchQuery}
                  placeholder="회의록 내 검색..."
                />
              </div>

              {/* Transcript Content */}
              <div className="max-h-[70vh] overflow-y-auto">
                {subtitlesLoading ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm">자막을 불러오는 중...</p>
                  </div>
                ) : (
                  <TranscriptView
                    subtitles={subtitles}
                    searchQuery={searchQuery}
                    onSubtitleClick={hasVideo ? handleSubtitleClick : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
