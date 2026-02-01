'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { SubtitleOverlay } from '@/components/subtitle/SubtitleOverlay';
import { SubtitleTimeline, TimelineSubtitle } from '@/components/subtitle/SubtitleTimeline';

interface Session {
  id: string;
  kmsUrl: string;
  midx: number;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  isLive: boolean;
  status: string;
}

interface Subtitle {
  id: string;
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  isEdited: boolean;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const initialTime = searchParams.get('t');

  const [session, setSession] = useState<Session | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 세션 정보 및 자막 로드
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // 세션 정보 가져오기
        const sessionsResponse = await fetch('/api/sessions');
        const sessionsData = await sessionsResponse.json();

        if (!sessionsResponse.ok) {
          throw new Error(sessionsData.error || '세션 정보를 불러올 수 없습니다');
        }

        const foundSession = sessionsData.sessions?.find((s: Session) => s.id === sessionId);
        if (!foundSession) {
          throw new Error('세션을 찾을 수 없습니다');
        }
        setSession(foundSession);

        // 비디오 URL 가져오기
        const videoResponse = await fetch(`/api/kms/video-url?url=${encodeURIComponent(foundSession.kmsUrl)}`);
        const videoData = await videoResponse.json();

        if (videoResponse.ok && videoData.videoUrl) {
          const proxyUrl = `/api/kms/proxy?url=${encodeURIComponent(videoData.videoUrl)}`;
          setHlsUrl(proxyUrl);
        }

        // 자막 가져오기
        const subtitlesResponse = await fetch(`/api/subtitles?sessionId=${sessionId}&limit=1000`);
        const subtitlesData = await subtitlesResponse.json();

        if (subtitlesResponse.ok) {
          setSubtitles(subtitlesData.subtitles || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '데이터를 불러올 수 없습니다');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [sessionId]);

  // 초기 시간으로 이동
  useEffect(() => {
    if (initialTime && videoRef.current) {
      const timeMs = parseInt(initialTime, 10);
      if (!isNaN(timeMs)) {
        videoRef.current.currentTime = timeMs / 1000;
      }
    }
  }, [initialTime, hlsUrl]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;

    // 초기 시간으로 이동
    if (initialTime) {
      const timeMs = parseInt(initialTime, 10);
      if (!isNaN(timeMs)) {
        video.currentTime = timeMs / 1000;
      }
    }
  }, [initialTime]);

  const handleTimeUpdate = useCallback((timeMs: number) => {
    setCurrentTimeMs(timeMs);
  }, []);

  const handleSeek = useCallback((timeMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeMs / 1000;
    }
  }, []);

  // 현재 자막 찾기
  const getCurrentSubtitle = useCallback((): string => {
    const current = subtitles.find(
      (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
    );
    return current?.text || '';
  }, [subtitles, currentTimeMs]);

  // 타임라인용 자막 변환
  const timelineSubtitles: TimelineSubtitle[] = subtitles.map((s) => ({
    id: s.id,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    text: s.text,
    isEdited: s.isEdited,
  }));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/history" className="text-blue-600 hover:text-blue-700">
              ← 히스토리로 돌아가기
            </Link>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <Link
              href="/history"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              ← 히스토리
            </Link>
            <h1 className="text-xl font-bold text-gray-900 mt-1">
              {session?.title || `KMS 영상 ${session?.midx}`}
            </h1>
            {session?.startedAt && (
              <p className="text-sm text-gray-500">
                {formatDateTime(session.startedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/api/subtitles/export?sessionId=${sessionId}&format=srt`}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              download
            >
              SRT 다운로드
            </Link>
            <Link
              href={`/api/subtitles/export?sessionId=${sessionId}&format=vtt`}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              download
            >
              VTT 다운로드
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 비디오 영역 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {hlsUrl ? (
                <div className="relative aspect-video">
                  <VideoPlayer
                    src={hlsUrl}
                    onReady={handleVideoReady}
                    onTimeUpdate={handleTimeUpdate}
                    className="w-full h-full"
                  >
                    <SubtitleOverlay text={getCurrentSubtitle()} />
                  </VideoPlayer>
                </div>
              ) : (
                <div className="aspect-video bg-gray-200 flex items-center justify-center">
                  <p className="text-gray-500">비디오를 불러올 수 없습니다</p>
                </div>
              )}
            </div>

            {/* 세션 정보 */}
            <div className="bg-white rounded-lg shadow mt-4 p-4">
              <h2 className="font-semibold mb-3">세션 정보</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">MIDX</dt>
                  <dd className="font-medium">{session?.midx}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">상태</dt>
                  <dd>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      session?.status === 'active'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {session?.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">자막 수</dt>
                  <dd className="font-medium">{subtitles.length}개</dd>
                </div>
                <div>
                  <dt className="text-gray-500">라이브</dt>
                  <dd className="font-medium">{session?.isLive ? '예' : '아니오'}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 자막 타임라인 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow h-[calc(100vh-200px)]">
              <div className="p-4 border-b">
                <h2 className="font-semibold">자막 목록</h2>
                <p className="text-sm text-gray-500">
                  {subtitles.length}개의 자막
                </p>
              </div>
              <SubtitleTimeline
                subtitles={timelineSubtitles}
                currentTimeMs={currentTimeMs}
                onSeek={handleSeek}
                className="h-[calc(100%-80px)]"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
