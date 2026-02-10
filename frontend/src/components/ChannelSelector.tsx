'use client';

import React, { useMemo } from 'react';

import type { ChannelType } from '@/types';

export interface ChannelSelectorProps {
  channels: ChannelType[];
  isLoading: boolean;
  onSelect: (channel: ChannelType) => void;
}

/** 상태별 정렬 우선순위 (낮을수록 앞) */
const STATUS_PRIORITY: Record<number, number> = {
  1: 0, // 방송중
  2: 1, // 정회중
  0: 2, // 방송전
  3: 3, // 종료
  4: 4, // 생중계없음
};

function StatusBadge({ livestatus, hasSchedule }: { livestatus?: number; hasSchedule?: boolean }) {
  const status = livestatus ?? 0;

  if (status === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        ON AIR
      </span>
    );
  }

  if (status === 2) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
        정회중
      </span>
    );
  }

  if (status === 3) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        종료
      </span>
    );
  }

  // 방송전(0): 일정 유무에 따라 구분
  if (status === 0 && hasSchedule) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
        방송전
      </span>
    );
  }

  // 생중계없음(4) 또는 일정 없는 방송전(0)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-400">
      OFF
    </span>
  );
}

/** 일정 정보 텍스트 (예: "제388회 제1차") */
function ScheduleInfo({ channel }: { channel: ChannelType }) {
  if (!channel.has_schedule || !channel.session_no) return null;

  return (
    <span className="text-[10px] text-gray-400 leading-tight">
      제{channel.session_no}회 제{channel.session_order}차
    </span>
  );
}

export default function ChannelSelector({ channels, isLoading, onSelect }: ChannelSelectorProps) {
  // 방송중 > 정회중 > 일정 있는 방송전 > 일정 없는 채널 순 정렬
  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.livestatus ?? 0] ?? 9;
      const pb = STATUS_PRIORITY[b.livestatus ?? 0] ?? 9;
      if (pa !== pb) return pa - pb;
      // 같은 상태일 때 일정 있는 채널 우선
      if (a.has_schedule !== b.has_schedule) return a.has_schedule ? -1 : 1;
      return 0;
    });
  }, [channels]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const scheduledCount = channels.filter(c => c.has_schedule).length;
  const liveCount = channels.filter(c => c.livestatus === 1).length;
  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  return (
    <div data-testid="channel-selector" className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-2">채널 선택</h2>
      <p className="text-gray-500 mb-1">시청할 위원회를 선택하세요</p>

      {/* 오늘의 일정 요약 */}
      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className="text-gray-400">{todayStr}</span>
        {scheduledCount > 0 ? (
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            오늘 {scheduledCount}개 회의 예정
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            오늘 예정된 회의 없음
          </span>
        )}
        {liveCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">
            {liveCount}개 방송중
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sortedChannels.map((channel) => {
          const isLive = channel.livestatus === 1;
          return (
            <button
              key={channel.id}
              data-testid={`channel-${channel.id}`}
              onClick={() => onSelect(channel)}
              className={`relative flex flex-col items-center p-4 bg-white border rounded-lg hover:shadow-md transition-all group ${
                isLive
                  ? 'border-green-400 ring-1 ring-green-200 hover:border-green-500'
                  : 'border-gray-200 hover:border-primary'
              }`}
            >
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-2 group-hover:bg-primary/10">
                <svg
                  className={`w-5 h-5 ${isLive ? 'text-green-500' : 'text-gray-500 group-hover:text-primary'}`}
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
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-primary text-center">
                {channel.name}
              </span>
              <ScheduleInfo channel={channel} />
              <div className="mt-1 h-5">
                <StatusBadge livestatus={channel.livestatus} hasSchedule={channel.has_schedule} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
