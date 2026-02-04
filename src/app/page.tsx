'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { SubtitleOverlay } from '@/components/subtitle/SubtitleOverlay';
import { SubtitleTimeline, TimelineSubtitle } from '@/components/subtitle/SubtitleTimeline';
import { UrlInput } from '@/components/ui/UrlInput';
import { LiveChannelList } from '@/components/live/LiveChannelList';
import { BatchTranscribePanel } from '@/components/batch/BatchTranscribePanel';
import { useSubtitleSession } from '@/hooks/useSubtitleSession';
import { useLiveSession, LiveSessionRole } from '@/hooks/useLiveSession';
import { BatchSubtitle } from '@/hooks/useBatchTranscribe';
import { cn } from '@/lib/utils';

// 입력 방법 타입
type InputMode = 'url' | 'live';

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>('live'); // 기본값: 생중계
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [midx, setMidx] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Map<number, string>>(new Map());
  const [lastDisplayedSubtitle, setLastDisplayedSubtitle] = useState<string>('');
  const [preCheckedSubtitles, setPreCheckedSubtitles] = useState<{
    checked: boolean;
    hasSubtitles: boolean;
    count: number;
    midx: number | null;
  }>({ checked: false, hasSubtitles: false, count: 0, midx: null });
  const [batchSubtitles, setBatchSubtitles] = useState<BatchSubtitle[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [actualVideoUrl, setActualVideoUrl] = useState<string | null>(null); // 실제 MP4/HLS URL
  const [isLiveStream, setIsLiveStream] = useState(false); // 생중계 스트림 여부
  const [liveChannelCode, setLiveChannelCode] = useState<string | null>(null); // 생중계 채널 코드
  const [followerSubtitles, setFollowerSubtitles] = useState<TimelineSubtitle[]>([]); // 팔로워가 수신한 자막
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

  // 라이브 세션 훅 (Leader Election + Supabase Realtime)
  const {
    role: liveRole,
    isConnected: isLiveConnected,
    isConnecting: isLiveConnecting,
    clientId,
    broadcastSubtitle,
    connect: connectLiveSession,
    disconnect: disconnectLiveSession,
  } = useLiveSession({
    channelCode: liveChannelCode || 'default',
    onSubtitle: (subtitle) => {
      // 팔로워가 자막 수신 시
      if (liveRole === 'follower') {
        setFollowerSubtitles((prev) => {
          // 중복 체크
          const exists = prev.some((s) => s.id === subtitle.id);
          if (exists) return prev;

          return [
            ...prev,
            {
              id: subtitle.id,
              startTimeMs: subtitle.startTime,
              endTimeMs: subtitle.endTime,
              text: subtitle.text,
              speaker: subtitle.speaker,
              isEdited: false,
            },
          ];
        });
      }
    },
    onRoleChange: (newRole) => {
      console.log(`[LiveSession] Role changed to: ${newRole}`);
    },
    onError: (error) => {
      console.error('[LiveSession] Error:', error);
    },
  });

  // 생중계 채널 선택 핸들러
  const handleLiveChannelSelect = useCallback(async (streamUrl: string, channelName?: string) => {
    setIsLoading(true);
    setUrlError(null);
    setPreCheckedSubtitles({ checked: false, hasSubtitles: false, count: 0, midx: null });
    setIsBatchMode(false); // 생중계는 배치 모드 아님
    setActualVideoUrl(null);
    setIsLiveStream(true); // 생중계 모드
    setFollowerSubtitles([]); // 이전 팔로워 자막 초기화

    try {
      // 생중계는 midx 없이 스트림 URL 직접 사용
      setVideoUrl(streamUrl);
      setMidx(null);
      setHlsUrl(streamUrl); // HLS URL 직접 사용 (CORS 필요 없음)

      // 채널 코드 생성 (URL에서 고유 식별자 추출)
      const channelCode = `live-${streamUrl.split('/').pop()?.split('.')[0] || Date.now()}`;
      setLiveChannelCode(channelCode);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : '스트림 연결 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // URL 제출 핸들러 - 비디오 로드 전에 기존 자막 확인
  const handleUrlSubmit = useCallback(async (url: string, extractedMidx: number | null) => {
    setIsLoading(true);
    setUrlError(null);
    setPreCheckedSubtitles({ checked: false, hasSubtitles: false, count: 0, midx: null });
    setIsLiveStream(false); // URL 직접 입력은 생중계가 아님
    setLiveChannelCode(null);
    setFollowerSubtitles([]);

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

      // 3.5. 실제 비디오 URL 저장 및 MP4 여부 확인
      const extractedVideoUrl = data.videoUrl;
      setActualVideoUrl(extractedVideoUrl);

      // MP4 파일인 경우에만 배치 모드 활성화
      const isActualMp4 = extractedVideoUrl.includes('.mp4');
      console.log('[URL Submit] Extracted video URL:', extractedVideoUrl, 'isMp4:', isActualMp4);
      setIsBatchMode(isActualMp4);
      if (isActualMp4) {
        setBatchSubtitles([]);
      }

      // 4. 프록시 URL 사용 (CORS 우회)
      const proxyUrl = `/api/kms/proxy?url=${encodeURIComponent(extractedVideoUrl)}`;
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

    // MP4 배치 모드면 실시간 STT 시작하지 않음
    if (isBatchMode) {
      console.log('[VideoReady] Batch mode - skipping realtime STT');
      return;
    }

    // 생중계 모드: Leader Election 적용
    if (isLiveStream && liveChannelCode) {
      console.log('[VideoReady] Live stream mode - connecting to live session');
      await connectLiveSession();
      // 리더/팔로워 역할은 useLiveSession 내부에서 결정됨
      // 리더인 경우에만 startSession 호출 (아래에서 useEffect로 처리)
      return;
    }

    // 기존 자막이 있으면 로드
    if (preCheckedSubtitles.checked) {
      console.log(`[VideoReady] Using pre-checked info: hasSubtitles=${preCheckedSubtitles.hasSubtitles}, count=${preCheckedSubtitles.count}, midx=${preCheckedSubtitles.midx}`);

      if (preCheckedSubtitles.hasSubtitles && preCheckedSubtitles.midx !== null) {
        console.log('[VideoReady] Loading existing subtitles with direct midx');
        await checkExistingSubtitles(preCheckedSubtitles.midx, videoUrl || undefined);
        return;
      }
    }

    // 기존 자막 없으면 실시간 STT 시작
    const effectiveMidx = preCheckedSubtitles.midx ?? midx;
    const effectiveVideoUrl = videoUrl || undefined;
    console.log(`[VideoReady] Starting realtime session with midx=${effectiveMidx}`);
    await startSession(video, effectiveMidx, effectiveVideoUrl);
  }, [preCheckedSubtitles, midx, videoUrl, startSession, checkExistingSubtitles, isBatchMode, isLiveStream, liveChannelCode, connectLiveSession]);

  // 배치 전사 완료 핸들러
  const handleBatchComplete = useCallback((batchResults: BatchSubtitle[]) => {
    console.log('[Batch] Transcription completed, subtitles:', batchResults.length);
    setBatchSubtitles(batchResults);
  }, []);

  // 배치 자막 클릭 시 해당 시간으로 이동
  const handleBatchSubtitleClick = useCallback((subtitle: BatchSubtitle) => {
    if (videoRef.current) {
      videoRef.current.currentTime = subtitle.startTime / 1000;
    }
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

  // 자막 세션 토글 (실시간 STT)
  const toggleSubtitleSession = useCallback(async () => {
    if (isActive) {
      stopSession();
    } else if (videoRef.current) {
      // 기존 자막이 있어도 실시간 STT 강제 시작
      await startRealtimeSession(videoRef.current);
    }
  }, [isActive, startRealtimeSession, stopSession]);

  // 마지막 자막 업데이트 - 새 자막이 추가될 때마다 갱신
  useEffect(() => {
    if (subtitles.length > 0) {
      const latestSubtitle = subtitles[subtitles.length - 1];
      setLastDisplayedSubtitle(latestSubtitle.text);
    }
  }, [subtitles]);

  // 생중계 리더 역할: RTZR 세션 시작
  useEffect(() => {
    if (isLiveStream && liveRole === 'leader' && isLiveConnected && videoRef.current && !isActive) {
      console.log('[LiveStream] Leader role confirmed - starting RTZR session');
      startRealtimeSession(videoRef.current);
    }
  }, [isLiveStream, liveRole, isLiveConnected, isActive, startRealtimeSession]);

  // 리더: 새 자막이 생성되면 브로드캐스트
  useEffect(() => {
    if (isLiveStream && liveRole === 'leader' && subtitles.length > 0) {
      const latestSubtitle = subtitles[subtitles.length - 1];
      broadcastSubtitle({
        id: latestSubtitle.id,
        text: latestSubtitle.text,
        startTime: latestSubtitle.startTimeMs,
        endTime: latestSubtitle.endTimeMs,
        isFinal: true,
        speaker: latestSubtitle.speaker,
        timestamp: Date.now(),
      });
    }
  }, [isLiveStream, liveRole, subtitles, broadcastSubtitle]);

  // 현재 표시할 자막 찾기
  const getCurrentSubtitle = useCallback((): string => {
    // 실시간 모드 (리더): currentTranscript만 표시 (SubtitleOverlay가 확정된 자막 관리)
    if (isActive) {
      return currentTranscript || '';
    }

    // 팔로워 모드: 팔로워 자막에서 검색 (최신 자막 표시)
    if (isLiveStream && liveRole === 'follower' && followerSubtitles.length > 0) {
      // 현재 시간에 맞는 자막 찾기 또는 가장 최신 자막
      const current = followerSubtitles.find(
        (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
      );
      if (current) return current.text;
      // 없으면 가장 최신 자막 반환
      return followerSubtitles[followerSubtitles.length - 1]?.text || '';
    }

    // 배치 모드: 배치 자막에서 검색
    if (isBatchMode && batchSubtitles.length > 0) {
      const current = batchSubtitles.find(
        (s) => currentTimeMs >= s.startTime && currentTimeMs < s.endTime
      );
      if (current) return current.text;
    }

    // 재생 모드: 시간 기반 자막 검색
    const current = subtitles.find(
      (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
    );
    if (current) return current.text;

    // 없으면 마지막으로 표시된 자막 유지
    return lastDisplayedSubtitle;
  }, [subtitles, currentTimeMs, currentTranscript, lastDisplayedSubtitle, isActive, isBatchMode, batchSubtitles, isLiveStream, liveRole, followerSubtitles]);

  // 타임라인용 자막 변환 (배치 모드 / 팔로워 모드 / 일반 모드)
  const timelineSubtitles: TimelineSubtitle[] = (() => {
    // 배치 모드: 배치 자막 사용
    if (isBatchMode && batchSubtitles.length > 0) {
      return batchSubtitles.map((s) => ({
        id: s.id,
        startTimeMs: s.startTime,
        endTimeMs: s.endTime,
        text: s.text,
        speaker: s.speaker,
        isEdited: false,
      }));
    }
    // 팔로워 모드: 팔로워 자막 사용
    if (isLiveStream && liveRole === 'follower' && followerSubtitles.length > 0) {
      return followerSubtitles;
    }
    // 일반 모드: 세션 자막 사용
    return subtitles.map((s) => ({
      id: s.id,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      text: s.text,
      speaker: s.speaker,
      isEdited: false,
    }));
  })();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => {
              // 메인으로 돌아가기: 상태 초기화
              setVideoUrl(null);
              setHlsUrl(null);
              setMidx(null);
              setInputMode('live');
              setIsBatchMode(false);
              setActualVideoUrl(null);
              setBatchSubtitles([]);
              setIsLiveStream(false);
              setLiveChannelCode(null);
              setFollowerSubtitles([]);
              stopSession();
              disconnectLiveSession();
            }}
          >
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
            <Link
              href="/feedback"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              개선 요청
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 입력 방법 선택 */}
        {!videoUrl && (
          <div className="bg-gray-900 rounded-lg shadow mb-6 overflow-hidden">
            {/* 탭 헤더 */}
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setInputMode('live')}
                className={cn(
                  'flex-1 px-6 py-4 text-sm font-medium transition-colors relative',
                  inputMode === 'live'
                    ? 'text-white bg-gray-800'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  경기도의회 생중계
                </span>
                {inputMode === 'live' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
                )}
              </button>
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex-1 px-6 py-4 text-sm font-medium transition-colors relative',
                  inputMode === 'url'
                    ? 'text-white bg-gray-800'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  URL 직접 입력
                </span>
                {inputMode === 'url' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            </div>

            {/* 탭 컨텐츠 */}
            <div className="p-6">
              {inputMode === 'live' ? (
                <LiveChannelList
                  onSelectChannel={handleLiveChannelSelect}
                  className="-m-2"
                />
              ) : (
                <div className="bg-gray-800 rounded-lg p-4">
                  <UrlInput onSubmit={handleUrlSubmit} isLoading={isLoading} />
                </div>
              )}
              {urlError && (
                <p className="mt-4 text-sm text-red-400 bg-red-900/20 p-3 rounded">{urlError}</p>
              )}
            </div>
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
                    {/* 기존 자막 정보 표시 */}
                    {hasExistingSubtitles && !isActive && (
                      <div className="flex items-center gap-2 text-blue-400 text-sm">
                        <div className="w-2 h-2 bg-blue-400 rounded-full" />
                        저장된 자막 {existingSubtitleCount}개
                      </div>
                    )}

                    {/* 생중계 역할 표시 */}
                    {isLiveStream && liveRole !== 'idle' && (
                      <div className={cn(
                        'flex items-center gap-2 text-sm px-2 py-1 rounded',
                        liveRole === 'leader' ? 'bg-purple-600/30 text-purple-300' : 'bg-cyan-600/30 text-cyan-300'
                      )}>
                        <div className={cn(
                          'w-2 h-2 rounded-full',
                          liveRole === 'leader' ? 'bg-purple-400 animate-pulse' : 'bg-cyan-400'
                        )} />
                        {liveRole === 'leader' ? '🎙️ 자막 생성 중 (리더)' : '📡 자막 수신 중'}
                      </div>
                    )}

                    {/* 실시간 자막 상태 (일반 모드) */}
                    {!isLiveStream && isActive && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        실시간 자막 활성화
                      </div>
                    )}

                    {/* 연결 중 상태 */}
                    {isConnecting && (
                      <div className="flex items-center gap-2 text-yellow-400 text-sm">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                        연결 중...
                      </div>
                    )}

                    {/* 중지 버튼 */}
                    {isActive && (
                      <button
                        onClick={stopSession}
                        className="px-3 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
                      >
                        자막 중지
                      </button>
                    )}

                    <span className="text-gray-400 text-xs">
                      💡 영상 속도 조절: 오른쪽 상단
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setVideoUrl(null);
                      setHlsUrl(null);
                      setLastDisplayedSubtitle('');
                      setIsBatchMode(false);
                      setActualVideoUrl(null);
                      setBatchSubtitles([]);
                      setIsLiveStream(false);
                      setLiveChannelCode(null);
                      setFollowerSubtitles([]);
                      stopSession();
                      disconnectLiveSession();
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

              {/* MP4 배치 전사 패널 */}
              {isBatchMode && actualVideoUrl && (
                <BatchTranscribePanel
                  videoUrl={actualVideoUrl}
                  onComplete={handleBatchComplete}
                  onSubtitleClick={handleBatchSubtitleClick}
                  className="mt-4"
                />
              )}
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
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">📺</span>
                <h3 className="font-semibold text-lg">경기도의회 생중계</h3>
              </div>
              <p className="text-gray-600 text-sm">
                현재 생중계 중인 위원회를 선택하면 실시간 자막을 바로 볼 수 있습니다.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🎯</span>
                <h3 className="font-semibold text-lg">AI 음성 인식</h3>
              </div>
              <p className="text-gray-600 text-sm">
                RTZR AI가 영상의 음성을 실시간으로 분석하여 자막을 생성합니다.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">💾</span>
                <h3 className="font-semibold text-lg">자동 저장</h3>
              </div>
              <p className="text-gray-600 text-sm">
                생성된 자막은 자동으로 저장되어 히스토리에서 다시 확인할 수 있습니다.
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
            href="/feedback"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            개선 요청 →
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
