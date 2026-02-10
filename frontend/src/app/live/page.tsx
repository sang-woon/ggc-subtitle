'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import Badge from '../../components/Badge';
import ChannelSelector from '../../components/ChannelSelector';
import Header from '../../components/Header';
import HlsPlayer from '../../components/HlsPlayer';
import SearchInput from '../../components/SearchInput';
import SubtitleOverlay from '../../components/SubtitleOverlay';
import SubtitlePanel from '../../components/SubtitlePanel';
import { useChannelStatus } from '../../hooks/useChannelStatus';
import useLiveMeeting from '../../hooks/useLiveMeeting';
import { useSubtitleSearch } from '../../hooks/useSubtitleSearch';
import { useSubtitleWebSocket } from '../../hooks/useSubtitleWebSocket';
import { API_BASE_URL } from '../../lib/api';

import type { ConnectionStatus } from '../../hooks/useSubtitleWebSocket';
import type { ChannelType } from '../../types';

/**
 * STT 활동 상태 인디케이터
 * - 음성 인식 중: 초록 펄스 + "음성 인식 중"
 * - 대기 중: 회색 + "N초 전 마지막 수신"
 * - 수신 없음: 회색 + "음성 대기 중"
 */
function SttActivityIndicator({
  interimText,
  lastActivityTime,
}: {
  interimText: string;
  lastActivityTime: number | null;
}) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!lastActivityTime) {
      setElapsed(null);
      return;
    }
    setElapsed(Math.floor((Date.now() - lastActivityTime) / 1000));
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastActivityTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastActivityTime]);

  // 음성 인식 중 (interim 텍스트가 있음)
  if (interimText) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid="stt-activity">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-green-600 font-medium">음성 인식 중</span>
      </div>
    );
  }

  // 최근 활동 있음 (10초 이내)
  if (elapsed !== null && elapsed < 10) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid="stt-activity">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
        </span>
        <span className="text-green-600">{elapsed}초 전 수신</span>
      </div>
    );
  }

  // 활동 있지만 시간이 좀 지남 (10초~60초)
  if (elapsed !== null && elapsed < 60) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid="stt-activity">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
        </span>
        <span className="text-yellow-600">{elapsed}초 전 수신</span>
      </div>
    );
  }

  // 활동 없거나 오래됨
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="stt-activity">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-300" />
      </span>
      <span className="text-gray-400">음성 대기 중</span>
    </div>
  );
}

/**
 * 연결 상태에 따른 배지 설정
 */
function getConnectionStatusBadge(status: ConnectionStatus): {
  variant: 'live' | 'success' | 'warning' | 'secondary';
  text: string;
} {
  switch (status) {
    case 'connecting':
      return { variant: 'warning', text: '연결 중...' };
    case 'connected':
      return { variant: 'success', text: '연결됨' };
    case 'disconnected':
      return { variant: 'secondary', text: '연결 끊김' };
    case 'error':
      return { variant: 'warning', text: '연결 오류' };
    default:
      return { variant: 'secondary', text: '알 수 없음' };
  }
}

function LivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelParam = searchParams.get('channel');

  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, _setCurrentTime] = useState<number | undefined>(undefined);

  // 채널 목록 (방송 상태 포함)
  const {
    channels,
    isLoading: isChannelsLoading,
    requestNotificationPermission,
  } = useChannelStatus();

  // 활성 채널 ID (URL 파라미터 또는 선택된 채널)
  const activeChannelId = channelParam || selectedChannel?.id;

  // 실시간 회의 데이터
  const { meeting } = useLiveMeeting(activeChannelId || undefined);

  // 활성 채널 전체 정보
  const activeChannel = selectedChannel
    || channels.find(c => c.id === channelParam)
    || null;

  // 활성 채널의 stream URL (meeting이 없어도 채널에서 직접 가져옴)
  const activeStreamUrl = meeting?.stream_url
    || activeChannel?.stream_url
    || '';

  // 활성 채널 이름
  const activeChannelName = activeChannel?.name || '';

  // 방송 상태: 채널 데이터 로드 전에는 null, 로드 후 true/false
  const isOnAir = activeChannel == null ? null : activeChannel.livestatus === 1;

  // WebSocket을 통한 실시간 자막 수신
  // meeting ID가 있으면 사용, 없으면 채널 ID로 직접 연결
  const wsRoomId = meeting?.id || activeChannelId || '';
  const {
    subtitles,
    interimText,
    lastActivityTime,
    connectionStatus,
    connect,
  } = useSubtitleWebSocket({
    meetingId: wsRoomId,
    autoConnect: !!activeChannelId,
    displayDelay: 1500, // HLS 영상 버퍼 지연에 맞춰 자막 표시를 1.5초 지연
  });

  // 자막 검색 기능
  const {
    filteredSubtitles,
    matchCount,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
  } = useSubtitleSearch({
    subtitles,
    query: searchQuery,
    filterMode: 'all',
  });

  // STT 상태 (UI 표시용)
  const [sttStatus, setSttStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');

  // 채널 선택 시 STT 시작 보장 (방송 중일 때만)
  // NOTE: cleanup에서 stop을 호출하지 않음.
  // STT 수명주기는 서버의 AutoSttManager가 방송 상태에 따라 자동 관리함.
  // 클라이언트가 stop을 호출하면 다른 모든 시청자의 자막도 끊김.
  useEffect(() => {
    if (!activeChannelId) {
      setSttStatus('idle');
      return;
    }

    // 명확히 방송 중이 아닐 때만 STT 스킵 (로딩 중에는 대기)
    if (isOnAir === false) {
      setSttStatus('idle');
      return;
    }

    let cancelled = false;
    const channelId = activeChannelId;

    async function ensureSttStarted() {
      setSttStatus('starting');

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (cancelled) return;

        try {
          const response = await fetch(
            `${API_BASE_URL}/api/channels/${channelId}/stt/start`,
            { method: 'POST' }
          );

          if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error(
              `[STT] start failed for ${channelId}: HTTP ${response.status} - ${body}`
            );
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
              continue;
            }
            if (!cancelled) setSttStatus('error');
            return;
          }

          const data = await response.json().catch(() => ({}));
          console.log(`[STT] ${channelId}: ${data.status ?? 'started'}`);
          if (!cancelled) setSttStatus('running');
          return;
        } catch (err) {
          console.error(
            `[STT] start error for ${channelId} (attempt ${attempt}/${maxRetries}):`,
            err
          );
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          } else {
            if (!cancelled) setSttStatus('error');
          }
        }
      }
    }

    ensureSttStarted();

    return () => {
      cancelled = true;
      setSttStatus('idle');
      // STT stop은 호출하지 않음 - 서버의 AutoSttManager가 방송 종료 시 자동 중지
    };
  }, [activeChannelId, isOnAir]);

  const handleHlsError = useCallback((err: Error) => {
    console.error('HLS Error:', err);
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSubtitleClick = useCallback((startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  }, []);

  const handleChannelSelect = (channel: ChannelType) => {
    setSelectedChannel(channel);
    router.push(`/live?channel=${channel.id}`);
    // 첫 채널 선택 시 알림 권한 요청
    requestNotificationPermission();
  };

  const handleBackToChannels = () => {
    setSelectedChannel(null);
    router.push('/live');
  };

  // 채널 미선택 상태 → ChannelSelector 표시
  if (!activeChannelId) {
    return (
      <div data-testid="live-page" className="min-h-screen flex flex-col bg-gray-50">
        <Header title="실시간 방송" showLiveBadge={false} />
        <ChannelSelector
          channels={channels}
          isLoading={isChannelsLoading}
          onSelect={handleChannelSelect}
        />
      </div>
    );
  }

  // 채널 선택됨 → 플레이어 표시
  const connectionBadge = getConnectionStatusBadge(connectionStatus);

  return (
    <div data-testid="live-page" className="min-h-screen flex flex-col bg-gray-50">
      <Header title={activeChannelName || '실시간 방송'} showSearch showLiveBadge={isOnAir === true}>
        <SearchInput onSearch={handleSearch} placeholder="자막 검색..." />
      </Header>

      {/* 채널 변경 바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
        <button
          onClick={handleBackToChannels}
          className="text-sm text-primary hover:text-primary-light flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          채널 목록
        </button>
        <span className="text-sm text-gray-400">|</span>
        <span className="text-sm font-medium text-gray-700">{activeChannelName}</span>
        {isOnAir === true ? (
          <Badge variant="live">LIVE</Badge>
        ) : isOnAir === false ? (
          <Badge variant="secondary">{activeChannel?.status_text || '방송전'}</Badge>
        ) : null}
        {sttStatus === 'starting' && (
          <Badge variant="warning">STT 시작 중...</Badge>
        )}
        {sttStatus === 'running' && (
          <Badge variant="success">STT 활성</Badge>
        )}
        {sttStatus === 'error' && (
          <Badge variant="warning">STT 오류</Badge>
        )}
      </div>

      <main
        data-testid="live-layout"
        className="flex-1 flex flex-col lg:flex-row gap-4 p-4"
      >
        {/* Main Content - Video Player (70% on desktop) */}
        <div
          data-testid="main-content"
          className="w-full lg:w-[70%]"
        >
          <div className="relative">
            {isOnAir === false ? (
              <div className="bg-gray-900 rounded-lg aspect-video flex flex-col items-center justify-center gap-3">
                <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-400 text-lg">현재 방송 중이 아닙니다</p>
                <p className="text-gray-500 text-sm">{activeChannel?.status_text || '방송전'}</p>
              </div>
            ) : activeStreamUrl ? (
              <HlsPlayer
                streamUrl={activeStreamUrl}
                videoRef={videoRef}
                onError={handleHlsError}
              />
            ) : (
              <div className="bg-black rounded-lg aspect-video flex items-center justify-center">
                <p className="text-gray-400">스트림 URL을 불러오는 중...</p>
              </div>
            )}
            {/* 영상 위 자막 오버레이 (최신 2줄) */}
            <SubtitleOverlay subtitles={subtitles} interimText={interimText} />
          </div>
        </div>

        {/* Sidebar - Subtitle Panel (30% on desktop) */}
        <div
          data-testid="sidebar"
          className="w-full lg:w-[30%] h-[50vh] lg:h-auto flex flex-col"
        >
          {/* Connection & STT Activity Status */}
          <div
            data-testid="connection-status"
            className="px-4 py-2 bg-white border border-gray-200 rounded-t-lg space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">자막 연결 상태</span>
              <div className="flex items-center gap-2">
                <Badge variant={connectionBadge.variant}>{connectionBadge.text}</Badge>
                {(connectionStatus === 'disconnected' || connectionStatus === 'error') && (
                  <button
                    onClick={connect}
                    className="text-xs text-primary hover:text-primary-light transition-colors"
                    data-testid="reconnect-button"
                  >
                    재연결
                  </button>
                )}
              </div>
            </div>
            {/* STT Activity Indicator */}
            {connectionStatus === 'connected' && (
              <SttActivityIndicator interimText={interimText} lastActivityTime={lastActivityTime} />
            )}
          </div>

          {/* Search Navigation */}
          {searchQuery && matchCount > 0 && (
            <div
              data-testid="search-navigation"
              className="flex items-center justify-between px-4 py-2 bg-yellow-50 border-x border-gray-200"
            >
              <span className="text-sm text-gray-700">
                검색 결과: {currentMatchIndex + 1} / {matchCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrevMatch}
                  className="p-1 text-gray-600 hover:text-primary transition-colors"
                  aria-label="이전 결과"
                  data-testid="prev-match-button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goToNextMatch}
                  className="p-1 text-gray-600 hover:text-primary transition-colors"
                  aria-label="다음 결과"
                  data-testid="next-match-button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {searchQuery && matchCount === 0 && (
            <div
              data-testid="no-search-results"
              className="px-4 py-2 bg-gray-50 border-x border-gray-200 text-sm text-gray-500"
            >
              &quot;{searchQuery}&quot;에 대한 검색 결과가 없습니다.
            </div>
          )}

          {/* Subtitle Panel */}
          <div className="flex-1 -mt-px">
            <SubtitlePanel
              subtitles={filteredSubtitles}
              searchQuery={searchQuery}
              currentTime={currentTime}
              onSubtitleClick={handleSubtitleClick}
              interimText={interimText}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    }>
      <LivePageContent />
    </Suspense>
  );
}
