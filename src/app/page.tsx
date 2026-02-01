'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { SubtitleOverlay } from '@/components/subtitle/SubtitleOverlay';
import { SubtitleTimeline, TimelineSubtitle } from '@/components/subtitle/SubtitleTimeline';
import { UrlInput } from '@/components/ui/UrlInput';
import { useSubtitleSession } from '@/hooks/useSubtitleSession';
import { cn } from '@/lib/utils';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [midx, setMidx] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Map<number, string>>(new Map());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const {
    isActive,
    isConnecting,
    subtitles,
    currentTranscript,
    error: sessionError,
    dbSessionId,
    startSession,
    stopSession,
    loadExistingSubtitles,
  } = useSubtitleSession({
    videoUrl: videoUrl || '',
    midx,
    title: `KMS 영상 ${midx || ''}`,
  });

  // URL 제출 핸들러
  const handleUrlSubmit = useCallback(async (url: string, extractedMidx: number | null) => {
    setIsLoading(true);
    setUrlError(null);

    try {
      setVideoUrl(url);
      setMidx(extractedMidx);

      // KMS 페이지에서 비디오 URL 추출
      const response = await fetch(`/api/kms/video-url?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '비디오 URL을 가져올 수 없습니다');
      }

      // 프록시 URL 사용 (CORS 우회)
      const proxyUrl = `/api/kms/proxy?url=${encodeURIComponent(data.videoUrl)}`;
      setHlsUrl(proxyUrl);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'URL 처리 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 비디오 준비 완료 핸들러
  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
  }, []);

  // 시간 업데이트 핸들러
  const handleTimeUpdate = useCallback((timeMs: number) => {
    setCurrentTimeMs(timeMs);
  }, []);

  // 자막 클릭시 해당 시간으로 이동
  const handleSeek = useCallback((timeMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeMs / 1000;
    }
  }, []);

  // 화자 이름 업데이트
  const handleSpeakerNameUpdate = useCallback((speaker: number, name: string) => {
    setSpeakerNames(prev => {
      const updated = new Map(prev);
      updated.set(speaker, name);
      return updated;
    });
  }, []);

  // 자막 세션 토글
  const toggleSubtitleSession = useCallback(async () => {
    if (isActive) {
      stopSession();
    } else if (videoRef.current) {
      await startSession(videoRef.current);
    }
  }, [isActive, startSession, stopSession]);

  // 현재 표시할 자막 찾기
  const getCurrentSubtitle = useCallback((): string => {
    if (currentTranscript) return currentTranscript;

    const current = subtitles.find(
      (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
    );
    return current?.text || '';
  }, [subtitles, currentTimeMs, currentTranscript]);

  // 타임라인용 자막 변환
  const timelineSubtitles: TimelineSubtitle[] = subtitles.map((s) => ({
    id: s.id,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    text: s.text,
    speaker: s.speaker,
    isEdited: false,
  }));

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            경기도의회 실시간 자막 시스템
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/search"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              자막 검색
            </Link>
            <Link
              href="/history"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              히스토리
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* URL 입력 */}
        {!videoUrl && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <UrlInput onSubmit={handleUrlSubmit} isLoading={isLoading} />
            {urlError && (
              <p className="mt-2 text-sm text-red-600">{urlError}</p>
            )}
          </div>
        )}

        {/* 비디오 + 자막 영역 */}
        {videoUrl && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 비디오 영역 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {/* 컨트롤 바 */}
                <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={toggleSubtitleSession}
                      disabled={isConnecting}
                      className={cn(
                        'px-4 py-1.5 rounded text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white',
                        isConnecting && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {isConnecting
                        ? '연결 중...'
                        : isActive
                        ? '자막 중지'
                        : '자막 시작'}
                    </button>
                    {isActive && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        실시간 자막 활성화
                      </div>
                    )}
                    <span className="text-gray-400 text-xs">
                      💡 영상 속도 조절: 오른쪽 상단 버튼
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setVideoUrl(null);
                      setHlsUrl(null);
                      stopSession();
                    }}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    URL 변경
                  </button>
                </div>

                {/* 비디오 플레이어 */}
                <div className="relative aspect-video">
                  {hlsUrl && (
                    <VideoPlayer
                      src={hlsUrl}
                      onReady={handleVideoReady}
                      onTimeUpdate={handleTimeUpdate}
                      className="w-full h-full"
                    >
                      <SubtitleOverlay
                        text={getCurrentSubtitle()}
                        isInterim={!!currentTranscript}
                      />
                    </VideoPlayer>
                  )}
                </div>

                {/* 세션 에러 표시 */}
                {sessionError && (
                  <div className="bg-red-50 border-t border-red-200 px-4 py-3">
                    <p className="text-sm text-red-700">{sessionError}</p>
                  </div>
                )}
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
                  currentTranscript={currentTranscript}
                  speakerNames={speakerNames}
                  onSeek={handleSeek}
                  onSpeakerNameUpdate={handleSpeakerNameUpdate}
                  className="h-[calc(100%-80px)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* 안내 섹션 */}
        {!videoUrl && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-lg mb-2">실시간 자막</h3>
              <p className="text-gray-600 text-sm">
                KMS 영상의 오디오를 실시간으로 분석하여 자막을 생성합니다.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-lg mb-2">자막 저장</h3>
              <p className="text-gray-600 text-sm">
                생성된 자막은 자동으로 저장되어 다음에 다시 확인할 수 있습니다.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-lg mb-2">검색 기능</h3>
              <p className="text-gray-600 text-sm">
                저장된 자막을 검색하여 원하는 내용을 빠르게 찾을 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* 네비게이션 링크 */}
        <div className="mt-8 flex justify-center gap-6">
          <Link
            href="/search"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            자막 검색 →
          </Link>
          <Link
            href="/history"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            세션 히스토리 →
          </Link>
          <Link
            href="/test-rtzr"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            RTZR 마이크 테스트 →
          </Link>
        </div>
      </main>
    </div>
  );
}
