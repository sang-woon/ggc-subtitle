'use client';

import React from 'react';

import { useRouter } from 'next/navigation';

import type { MeetingType } from '@/types';

import Badge, { type BadgeVariant } from './Badge';

export interface RecentVodListProps {
  vods: MeetingType[];
  className?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getStatusBadge(status: MeetingType['status']): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'ended':
      return { label: '자막 완료', variant: 'success' };
    case 'processing':
      return { label: '자막 생성중', variant: 'warning' };
    default:
      return { label: status, variant: 'secondary' };
  }
}

export default function RecentVodList({ vods, className = '' }: RecentVodListProps) {
  const router = useRouter();

  const handleItemClick = (id: string) => {
    router.push(`/vod/${id}`);
  };

  return (
    <section className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`.trim()}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 VOD</h2>

      {vods.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500">등록된 VOD가 없습니다</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {vods.map((vod) => {
            const statusBadge = getStatusBadge(vod.status);

            return (
              <li key={vod.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(vod.id)}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900 truncate">{vod.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-500">{formatDate(vod.meeting_date)}</span>
                      <span className="text-sm text-gray-400">|</span>
                      <span className="text-sm text-gray-500 font-mono">
                        {formatDuration(vod.duration_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
