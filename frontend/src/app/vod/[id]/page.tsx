'use client';

import React, { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import Header from '../../../components/Header';
import Mp4Player from '../../../components/Mp4Player';
import SubtitlePanel from '../../../components/SubtitlePanel';
import VideoControls from '../../../components/VideoControls';
import { apiClient } from '../../../lib/api';

import type { MeetingType, SubtitleType } from '../../../types';

interface VodViewerPageProps {
  params: { id: string };
}

export default function VodViewerPage({ params }: VodViewerPageProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { id } = params;

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [meetingData, subtitlesData] = await Promise.all([
          apiClient<MeetingType>(`/api/meetings/${id}`),
          apiClient<SubtitleType[]>(`/api/meetings/${id}/subtitles`),
        ]);

        setMeeting(meetingData);
        setSubtitles(subtitlesData);
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
  }, [id]);

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
    <div data-testid="vod-viewer-page" className="min-h-screen flex flex-col bg-gray-50">
      <Header title={meeting.title} showVodBadge />

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
          className="w-full lg:w-[30%] h-[50vh] lg:h-auto"
        >
          <SubtitlePanel
            subtitles={subtitles}
            currentTime={currentTime}
            autoScroll={false}
            onSubtitleClick={handleSubtitleClick}
          />
        </div>
      </main>
    </div>
  );
}
