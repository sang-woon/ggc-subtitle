'use client';

import React, { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import Badge from '../../components/Badge';
import Header from '../../components/Header';
import HlsPlayer from '../../components/HlsPlayer';
import SearchInput from '../../components/SearchInput';
import SubtitlePanel from '../../components/SubtitlePanel';
import useLiveMeeting from '../../hooks/useLiveMeeting';
import { useSubtitleSearch } from '../../hooks/useSubtitleSearch';
import { useSubtitleWebSocket } from '../../hooks/useSubtitleWebSocket';

import type { ConnectionStatus } from '../../hooks/useSubtitleWebSocket';

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

export default function LivePage() {
  const router = useRouter();
  const { meeting, isLoading, error } = useLiveMeeting();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, _setCurrentTime] = useState<number | undefined>(undefined);

  // WebSocket을 통한 실시간 자막 수신
  const {
    subtitles,
    connectionStatus,
    connect,
    // disconnect is available but not used in current UI
  } = useSubtitleWebSocket({
    meetingId: meeting?.id || '',
    autoConnect: !!meeting, // meeting이 있을 때만 자동 연결
  });

  // 자막 검색 기능 - 검색어로 필터링 또는 전체 표시
  const {
    filteredSubtitles,
    matchCount,
    currentMatchIndex,
    // currentMatch can be used for auto-scrolling to matched subtitle
    goToNextMatch,
    goToPrevMatch,
  } = useSubtitleSearch({
    subtitles,
    query: searchQuery,
    filterMode: 'all', // 전체 자막 표시하면서 하이라이트
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
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
  if (error) {
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

  // No live meeting
  if (!meeting) {
    return (
      <div data-testid="live-page" className="min-h-screen flex flex-col">
        <Header title="실시간 방송" showLiveBadge={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg
              className="w-16 h-16 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 mb-4">현재 진행 중인 방송이 없습니다.</p>
            <button
              onClick={handleHomeClick}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-light transition-colors"
            >
              홈으로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }

  const connectionBadge = getConnectionStatusBadge(connectionStatus);

  return (
    <div data-testid="live-page" className="min-h-screen flex flex-col bg-gray-50">
      <Header title={meeting.title} showSearch showLiveBadge>
        <SearchInput onSearch={handleSearch} placeholder="자막 검색..." />
      </Header>

      <main
        data-testid="live-layout"
        className="flex-1 flex flex-col lg:flex-row gap-4 p-4"
      >
        {/* Main Content - Video Player (70% on desktop) */}
        <div
          data-testid="main-content"
          className="w-full lg:w-[70%]"
        >
          <HlsPlayer
            streamUrl={meeting.stream_url || ''}
            videoRef={videoRef}
            onError={(err) => console.error('HLS Error:', err)}
          />
        </div>

        {/* Sidebar - Subtitle Panel (30% on desktop) */}
        <div
          data-testid="sidebar"
          className="w-full lg:w-[30%] h-[50vh] lg:h-auto flex flex-col"
        >
          {/* Connection Status */}
          <div
            data-testid="connection-status"
            className="flex items-center justify-between px-4 py-2 bg-white border border-gray-200 rounded-t-lg"
          >
            <span className="text-sm text-gray-600">자막 연결 상태</span>
            <div className="flex items-center gap-2">
              <Badge variant={connectionBadge.variant}>{connectionBadge.text}</Badge>
              {connectionStatus === 'disconnected' && (
                <button
                  onClick={connect}
                  className="text-xs text-primary hover:text-primary-light transition-colors"
                  data-testid="reconnect-button"
                >
                  재연결
                </button>
              )}
              {connectionStatus === 'error' && (
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

          {/* Search Navigation (visible when searching) */}
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

          {/* No results message */}
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
            />
          </div>
        </div>
      </main>
    </div>
  );
}
