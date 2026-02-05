'use client';

import React from 'react';

import { useRouter } from 'next/navigation';

import type { MeetingType } from '@/types';

import Badge, { type BadgeVariant } from './Badge';

export interface VodTableProps {
  vods: MeetingType[];
  className?: string;
}

/**
 * Format a date string to Korean format (YYYY년 M월 D일)
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * Format duration in seconds to HH:MM:SS format
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Get status badge info based on meeting status
 */
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

/**
 * VOD Table Component
 *
 * Displays VOD list in a table format on desktop, and card format on mobile.
 * Clicking a row navigates to the VOD viewer page.
 */
export default function VodTable({ vods, className = '' }: VodTableProps) {
  const router = useRouter();

  const handleRowClick = (id: string) => {
    router.push(`/vod/${id}`);
  };

  if (vods.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`.trim()}>
        <p className="text-gray-500">등록된 VOD가 없습니다</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Desktop Table View */}
      <table className="hidden md:table w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">제목</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">날짜</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">재생시간</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">상태</th>
          </tr>
        </thead>
        <tbody>
          {vods.map((vod) => {
            const statusBadge = getStatusBadge(vod.status);
            return (
              <tr
                key={vod.id}
                onClick={() => handleRowClick(vod.id)}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="py-4 px-4">
                  <span className="font-medium text-gray-900">{vod.title}</span>
                </td>
                <td className="py-4 px-4 text-sm text-gray-600">
                  {formatDate(vod.meeting_date)}
                </td>
                <td className="py-4 px-4 text-sm text-gray-600 font-mono">
                  {formatDuration(vod.duration_seconds)}
                </td>
                <td className="py-4 px-4">
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile Card View - uses data attributes for CSS-driven content rendering */}
      <div className="md:hidden space-y-3" data-testid="vod-mobile-view">
        {vods.map((vod) => (
          <div
            key={vod.id}
            data-testid="vod-mobile-card"
            data-title={vod.title}
            data-date={formatDate(vod.meeting_date)}
            data-duration={formatDuration(vod.duration_seconds)}
            data-status={vod.status}
            onClick={() => handleRowClick(vod.id)}
            className="p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          />
        ))}
      </div>
    </div>
  );
}
