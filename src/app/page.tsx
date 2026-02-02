'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { SubtitleOverlay } from '@/components/subtitle/SubtitleOverlay';
import { SubtitleTimeline, TimelineSubtitle } from '@/components/subtitle/SubtitleTimeline';
import { UrlInput } from '@/components/ui/UrlInput';
import { useSubtitleSession } from '@/hooks/useSubtitleSession';
import { useDelayedPlayback } from '@/hooks/useDelayedPlayback';
import { cn } from '@/lib/utils';

// 자막 모드 타입
type SubtitleMode = 'realtime' | 'delayed';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [midx, setMidx] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Map<number, string>>(new Map());
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('delayed'); // 기본값: 지연 모드
  const [preCheckedSubtitles, setPreCheckedSubtitles] = useState<{
    checked: boolean;
    hasSubtitles: boolean;
    count: number;
    midx: number | null;
  }>({ checked: false, hasSubtitles: false, count: 0, midx: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const {
    isActive,
    isConnecting,
    subtitles,
    currentTranscript,
    error: sessionError,
    dbSessionId,
    hasExistingSubtitles,
    existingSubtitleCount,
    startSession,
    stopSession,
    loadExistingSubtitles,
    checkExistingSubtitles,
    startRealtimeSession,
  } = useSubtitleSession({
    videoUrl: videoUrl || '',
    midx,
    title: `KMS 영상 ${midx || ''}`,
  });

  // 지연 송출 모드 훅
  const {
    isBuffering,
    isPlaying: isDelayedPlaying,
    bufferProgress,
    displaySubtitles: delayedSubtitles,
    currentTranscript: delayedTranscript,
    error: delayedError,
    startDelayedPlayback,
    stopPlayback: stopDelayedPlayback,
  } = useDelayedPlayback({
    videoUrl: videoUrl || '',
    midx,
    title: `KMS 영상 ${midx || ''}`,
    delayMs: 15000, // 15초 지연
    enableOpenAI: true, // OpenAI 보정 활성화
  });

  // URL 제출 핸들러 - 비디오 로드 전에 기존 자막 확인
  const handleUrlSubmit = useCallback(async (url: string, extractedMidx: number | null) => {
    setIsLoading(true);
    setUrlError(null);
    setPreCheckedSubtitles({ checked: false, hasSubtitles: false, count: 0, midx: null });

    try {
      // 1. 먼저 기존 자막이 있는지 확인 (비디오 로드 전)
      if (extractedMidx !== null) {
        console.log('[Pre-check] Checking existing subtitles for midx:', extractedMidx);
        const sessionResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kmsUrl: url,
            midx: extractedMidx,
            title: `KMS 영상 ${extractedMidx}`,
            isLive: true,
          }),
        });

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          const subtitleCount = sessionData.subtitleCount || 0;
          const hasSubtitles = sessionData.isExisting && subtitleCount > 0;

          console.log(`[Pre-check] Found session: isExisting=${sessionData.isExisting}, subtitleCount=${subtitleCount}`);

          setPreCheckedSubtitles({
            checked: true,
            hasSubtitles,
            count: subtitleCount,
            midx: extractedMidx,
          });
        }
      }

      // 2. 상태 업데이트
      setVideoUrl(url);
      setMidx(extractedMidx);

      // 3. KMS 페이지에서 비디오 URL 추출
      const response = await fetch(`/api/kms/video-url?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '비디오 URL을 가져올 수 없습니다');
      }

      // 4. 프록시 URL 사용 (CORS 우회)
      const proxyUrl = `/api/kms/proxy?url=${encodeURIComponent(data.videoUrl)}`;
      setHlsUrl(proxyUrl);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'URL 처리 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 비디오 준비 완료 핸들러
  const handleVideoReady = useCallback(async (video: HTMLVideoElement) => {
    videoRef.current = video;

    // 미리 확인된 자막 정보가 있으면 그것을 사용
    if (preCheckedSubtitles.checked) {
      console.log(`[VideoReady] Using pre-checked info: hasSubtitles=${preCheckedSubtitles.hasSubtitles}, count=${preCheckedSubtitles.count}, midx=${preCheckedSubtitles.midx}`);

      if (preCheckedSubtitles.hasSubtitles && preCheckedSubtitles.midx !== null) {
        // midx를 직접 전달하여 기존 자막 로드 (상태 업데이트 타이밍 문제 해결)
        console.log('[VideoReady] Loading existing subtitles with direct midx');
        await checkExistingSubtitles(preCheckedSubtitles.midx, videoUrl || undefined);
        // STT 시작 안 함
        return;
      }
    }

    // 기존 자막이 없는 경우, 선택한 모드에 따라 시작
    if (subtitleMode === 'delayed') {
      console.log('[VideoReady] Starting delayed playback mode');
      await startDelayedPlayback(video);
    } else {
      // 실시간 모드
      const effectiveMidx = preCheckedSubtitles.midx ?? midx;
      const effectiveVideoUrl = videoUrl || undefined;
      console.log(`[VideoReady] Starting realtime session with midx=${effectiveMidx}`);
      await startSession(video, effectiveMidx, effectiveVideoUrl);
    }
  }, [preCheckedSubtitles, midx, videoUrl, subtitleMode, startSession, checkExistingSubtitles, startDelayedPlayback]);

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

  // 자막 세션 토글 (실시간 STT)
  const toggleSubtitleSession = useCallback(async () => {
    if (isActive) {
      stopSession();
    } else if (videoRef.current) {
      // 기존 자막이 있어도 실시간 STT 강제 시작
      await startRealtimeSession(videoRef.current);
    }
  }, [isActive, startRealtimeSession, stopSession]);

  // 현재 모드에 따른 자막과 트랜스크립트
  const activeSubtitles = subtitleMode === 'delayed' && isDelayedPlaying
    ? delayedSubtitles
    : subtitles;
  const activeTranscript = subtitleMode === 'delayed'
    ? delayedTranscript
    : currentTranscript;
  const activeError = subtitleMode === 'delayed'
    ? delayedError
    : sessionError;

  // 현재 표시할 자막 찾기
  const getCurrentSubtitle = useCallback((): string => {
    if (activeTranscript) return activeTranscript;

    const current = activeSubtitles.find(
      (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
    );
    return current?.text || '';
  }, [activeSubtitles, currentTimeMs, activeTranscript]);

  // 타임라인용 자막 변환
  const timelineSubtitles: TimelineSubtitle[] = activeSubtitles.map((s) => ({
    id: s.id,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    text: s.text,
    speaker: s.speaker,
    isEdited: false,
  }));

  // 현재 활성 상태 (실시간 또는 지연)
  const isCurrentlyActive = subtitleMode === 'delayed'
    ? (isBuffering || isDelayedPlaying)
    : isActive;

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
                    {/* 기존 자막이 있으면 다른 UI 표시 */}
                    {hasExistingSubtitles && !isCurrentlyActive ? (
                      <>
                        <div className="flex items-center gap-2 text-blue-400 text-sm">
                          <div className="w-2 h-2 bg-blue-400 rounded-full" />
                          저장된 자막 {existingSubtitleCount}개
                        </div>
                        <button
                          onClick={toggleSubtitleSession}
                          disabled={isConnecting}
                          className={cn(
                            'px-3 py-1 rounded text-xs font-medium transition-colors',
                            'bg-gray-600 hover:bg-gray-500 text-white',
                            isConnecting && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {isConnecting ? '연결 중...' : '실시간 자막 추가'}
                        </button>
                      </>
                    ) : (
                      <>
                        {/* 모드 선택 */}
                        {!isCurrentlyActive && (
                          <div className="flex items-center gap-2 bg-gray-700 rounded px-2 py-1">
                            <button
                              onClick={() => setSubtitleMode('delayed')}
                              className={cn(
                                'px-2 py-0.5 rounded text-xs transition-colors',
                                subtitleMode === 'delayed'
                                  ? 'bg-purple-600 text-white'
                                  : 'text-gray-400 hover:text-white'
                              )}
                            >
                              지연 송출
                            </button>
                            <button
                              onClick={() => setSubtitleMode('realtime')}
                              className={cn(
                                'px-2 py-0.5 rounded text-xs transition-colors',
                                subtitleMode === 'realtime'
                                  ? 'bg-green-600 text-white'
                                  : 'text-gray-400 hover:text-white'
                              )}
                            >
                              실시간
                            </button>
                          </div>
                        )}

                        {/* 버퍼링 상태 표시 (지연 모드) */}
                        {isBuffering && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-purple-400 text-sm">
                              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                              버퍼링 중...
                            </div>
                            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 transition-all duration-100"
                                style={{ width: `${bufferProgress}%` }}
                              />
                            </div>
                            <span className="text-purple-400 text-xs">
                              {Math.round(bufferProgress)}%
                            </span>
                          </div>
                        )}

                        {/* 지연 재생 중 상태 */}
                        {isDelayedPlaying && (
                          <div className="flex items-center gap-2 text-purple-400 text-sm">
                            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                            지연 송출 중 (15초 지연)
                          </div>
                        )}

                        {/* 실시간 모드 상태 */}
                        {subtitleMode === 'realtime' && isActive && (
                          <div className="flex items-center gap-2 text-green-400 text-sm">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            실시간 자막 활성화
                          </div>
                        )}

                        {/* 중지 버튼 */}
                        {isCurrentlyActive && (
                          <button
                            onClick={() => {
                              if (subtitleMode === 'delayed') {
                                stopDelayedPlayback();
                              } else {
                                stopSession();
                              }
                            }}
                            className="px-3 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
                          >
                            자막 중지
                          </button>
                        )}
                      </>
                    )}
                    {!isBuffering && (
                      <span className="text-gray-400 text-xs">
                        {subtitleMode === 'delayed' ? '🎯 15초 지연으로 보정된 자막' : '💡 영상 속도 조절: 오른쪽 상단'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setVideoUrl(null);
                      setHlsUrl(null);
                      stopSession();
                      stopDelayedPlayback();
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
                {activeError && (
                  <div className="bg-red-50 border-t border-red-200 px-4 py-3">
                    <p className="text-sm text-red-700">{activeError}</p>
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
                    {activeSubtitles.length}개의 자막
                    {subtitleMode === 'delayed' && isBuffering && ' (버퍼링 중)'}
                  </p>
                </div>
                <SubtitleTimeline
                  subtitles={timelineSubtitles}
                  currentTimeMs={currentTimeMs}
                  currentTranscript={activeTranscript}
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
