'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import Badge from '@/components/Badge';
import Header from '@/components/Header';
import { useChannelStatus } from '@/hooks/useChannelStatus';
import type { ChannelType, SubtitleType } from '@/types';

/**
 * 개별 채널 모니터 카드 - 채널의 최신 자막을 WebSocket으로 수신
 */
function MonitorChannelCard({ channel }: { channel: ChannelType }) {
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [interimText, setInterimText] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    const url = `${wsBaseUrl}/ws/meetings/${channel.id}/subtitles`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'subtitle_history') {
            setSubtitles(msg.payload.subtitles.slice(-5));
          } else if (msg.type === 'subtitle_created') {
            setSubtitles((prev) => [...prev.slice(-4), msg.payload.subtitle]);
            setInterimText('');
          } else if (msg.type === 'subtitle_interim') {
            setInterimText(msg.payload.text);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setConnected(false);
        // 자동 재연결
        setTimeout(() => {
          if (isMountedRef.current) connect();
        }, 5000);
      };

      ws.onerror = () => {
        if (isMountedRef.current) setConnected(false);
      };
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [channel.id]);

  const isOnAir = channel.livestatus === 1;
  const isRecess = channel.livestatus === 2;

  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${
      isOnAir ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200'
    }`}>
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{channel.name}</h3>
          <span className="text-xs text-gray-400 flex-shrink-0">{channel.id}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isOnAir ? (
            <Badge variant="live">ON AIR</Badge>
          ) : isRecess ? (
            <Badge variant="warning">정회중</Badge>
          ) : (
            <Badge variant="secondary">{channel.status_text || '방송전'}</Badge>
          )}
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* Subtitle Feed */}
      <div className="h-40 overflow-y-auto">
        {subtitles.length === 0 && !interimText ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            {isOnAir ? '자막 대기 중...' : '방송 대기 중'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {interimText && (
              <div className="px-3 py-2 bg-blue-50/50">
                <span className="flex items-center gap-1 mb-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                  </span>
                  <span className="text-[10px] text-blue-600">인식 중</span>
                </span>
                <p className="text-xs text-gray-500 italic leading-relaxed">{interimText}</p>
              </div>
            )}
            {[...subtitles].reverse().map((sub) => (
              <div key={sub.id} className="px-3 py-2">
                <span className="text-[10px] font-mono text-gray-400">
                  {formatTime(sub.start_time)}
                </span>
                <p className="text-xs text-gray-800 leading-relaxed mt-0.5">{sub.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card Footer */}
      {isOnAir && (
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <Link
            href={`/live?channel=${channel.id}`}
            className="text-xs text-primary hover:text-primary-light transition-colors"
          >
            전체 화면으로 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function MonitorPage() {
  const { channels, isLoading } = useChannelStatus();

  // 방송 중인 채널 우선 정렬
  const sortedChannels = [...channels].sort((a, b) => {
    const aStatus = a.livestatus ?? 4;
    const bStatus = b.livestatus ?? 4;
    // 방송중(1) > 정회중(2) > 방송전(0) > 종료(3) > 생중계없음(4)
    const priority: Record<number, number> = { 1: 0, 2: 1, 0: 2, 3: 3, 4: 4 };
    return (priority[aStatus] ?? 5) - (priority[bStatus] ?? 5);
  });

  const liveCount = channels.filter((ch) => ch.livestatus === 1).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">실시간 모니터</h1>
            {liveCount > 0 && (
              <Badge variant="live">{liveCount}개 방송 중</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            모든 채널의 실시간 자막을 한눈에 확인하세요
          </p>
        </div>

        {/* Channel Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 h-56 animate-pulse">
                <div className="p-4 border-b border-gray-100">
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedChannels.map((channel) => (
              <MonitorChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
