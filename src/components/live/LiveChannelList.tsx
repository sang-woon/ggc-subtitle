'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveChannel, LiveStatusResponse } from '@/types/live';
import { cn } from '@/lib/utils';

interface LiveChannelListProps {
  onSelectChannel: (streamUrl: string) => void;
  className?: string;
}

// 상태 변경 알림 타입
interface StatusNotification {
  id: string;
  channelName: string;
  oldStatus: string;
  newStatus: string;
  timestamp: number;
}

/**
 * 경기도의회 생중계 채널 목록 컴포넌트
 * - 현재 생중계 중인 채널 카드 형태로 표시
 * - 방송중: 빨간색 LIVE 배지 + 클릭 가능
 * - 방송전: 회색 배지
 * - 생중계없음: 비활성화
 */
export function LiveChannelList({ onSelectChannel, className }: LiveChannelListProps) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [notifications, setNotifications] = useState<StatusNotification[]>([]);
  const prevChannelsRef = useRef<Map<string, LiveChannel>>(new Map());
  const isFirstLoad = useRef(true);

  // 알림 자동 제거 (5초 후)
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(() => {
        setNotifications(prev => prev.slice(1));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  // 알림 수동 제거
  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/live/status');
      const data: LiveStatusResponse = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        // 상태 변경 감지 (첫 로드가 아닐 때만)
        if (!isFirstLoad.current && prevChannelsRef.current.size > 0) {
          const newNotifications: StatusNotification[] = [];

          for (const channel of data.channels) {
            const prevChannel = prevChannelsRef.current.get(channel.code);
            if (prevChannel && prevChannel.status !== channel.status) {
              // 상태가 변경됨
              newNotifications.push({
                id: `${channel.code}-${Date.now()}`,
                channelName: channel.name,
                oldStatus: prevChannel.statusText,
                newStatus: channel.statusText,
                timestamp: Date.now(),
              });
            }
          }

          if (newNotifications.length > 0) {
            setNotifications(prev => [...prev, ...newNotifications]);
          }
        }

        isFirstLoad.current = false;

        // 현재 상태 저장
        const channelMap = new Map<string, LiveChannel>();
        for (const ch of data.channels) {
          channelMap.set(ch.code, ch);
        }
        prevChannelsRef.current = channelMap;

        setChannels(data.channels);
        setLastUpdated(data.lastUpdated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '채널 정보를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();

    // 30초마다 자동 갱신
    const interval = setInterval(fetchChannels, 30000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const handleChannelClick = (channel: LiveChannel) => {
    if (channel.status === 'live' && channel.streamUrl) {
      onSelectChannel(channel.streamUrl);
    }
  };

  // 방송중인 채널을 먼저 표시
  const sortedChannels = [...channels].sort((a, b) => {
    const statusOrder = { live: 0, upcoming: 1, off: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const liveCount = channels.filter(c => c.status === 'live').length;

  if (loading && channels.length === 0) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <span className="ml-3 text-gray-400">채널 정보 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error && channels.length === 0) {
    return (
      <div className={cn('p-4', className)}>
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchChannels}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-4 relative', className)}>
      {/* 상태 변경 알림 */}
      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'p-4 rounded-lg shadow-lg border animate-slide-in',
                notification.newStatus === '방송중'
                  ? 'bg-red-900/95 border-red-500 text-white'
                  : notification.newStatus === '방송전'
                  ? 'bg-yellow-900/95 border-yellow-500 text-white'
                  : 'bg-gray-800/95 border-gray-600 text-white'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm mb-1">
                    {notification.newStatus === '방송중' ? '🔴 ' : '📢 '}
                    상태 변경
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">{notification.channelName}</span>
                  </p>
                  <p className="text-xs mt-1 opacity-80">
                    {notification.oldStatus} → {notification.newStatus}
                  </p>
                </div>
                <button
                  onClick={() => dismissNotification(notification.id)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">경기도의회 생중계</h3>
          {liveCount > 0 && (
            <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded animate-pulse">
              {liveCount}개 방송중
            </span>
          )}
        </div>
        <button
          onClick={fetchChannels}
          disabled={loading}
          className={cn(
            'p-2 rounded-lg transition-colors',
            loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'
          )}
          title="새로고침"
        >
          <svg
            className={cn('w-5 h-5 text-gray-400', loading && 'animate-spin')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* 마지막 업데이트 시간 */}
      {lastUpdated && (
        <p className="text-xs text-gray-500 mb-4">
          마지막 업데이트: {new Date(lastUpdated).toLocaleTimeString('ko-KR')}
        </p>
      )}

      {/* 채널 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sortedChannels.map((channel) => (
          <ChannelCard
            key={channel.code}
            channel={channel}
            onClick={() => handleChannelClick(channel)}
          />
        ))}
      </div>

      {channels.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-400">
          현재 등록된 채널이 없습니다
        </div>
      )}
    </div>
  );
}

interface ChannelCardProps {
  channel: LiveChannel;
  onClick: () => void;
}

function ChannelCard({ channel, onClick }: ChannelCardProps) {
  const isClickable = channel.status === 'live' && channel.streamUrl;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={cn(
        'p-4 rounded-lg border transition-all duration-200',
        isClickable && 'cursor-pointer hover:border-red-500 hover:shadow-lg hover:shadow-red-500/10',
        channel.status === 'live' && 'border-red-600 bg-red-950/30',
        channel.status === 'upcoming' && 'border-yellow-600/50 bg-yellow-950/20',
        channel.status === 'off' && 'border-gray-700 bg-gray-800/50 opacity-60'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className={cn(
          'font-medium truncate pr-2',
          channel.status === 'live' ? 'text-white' : 'text-gray-300'
        )}>
          {channel.name}
        </h4>
        <StatusBadge status={channel.status} statusText={channel.statusText} />
      </div>

      {channel.status === 'live' && (
        <p className="text-xs text-red-400 mt-2">
          클릭하여 자막 시작
        </p>
      )}

      {channel.status === 'upcoming' && (
        <p className="text-xs text-yellow-500 mt-2">
          방송 예정
        </p>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: LiveChannel['status'];
  statusText: string;
}

function StatusBadge({ status, statusText }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap',
        status === 'live' && 'bg-red-600 text-white animate-pulse',
        status === 'upcoming' && 'bg-yellow-600/80 text-yellow-100',
        status === 'off' && 'bg-gray-600 text-gray-300'
      )}
    >
      {status === 'live' && '● '}
      {statusText}
    </span>
  );
}
