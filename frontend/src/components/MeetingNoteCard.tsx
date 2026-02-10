'use client';

import React from 'react';

import Link from 'next/link';

import type { MeetingNoteType } from '@/types';

import Badge from './Badge';


export interface MeetingNoteCardProps {
  note: MeetingNoteType;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getStatusBadge(status: string): { variant: 'live' | 'success' | 'warning' | 'secondary'; text: string } {
  switch (status) {
    case 'live':
      return { variant: 'live', text: 'LIVE' };
    case 'processing':
      return { variant: 'warning', text: '처리 중' };
    case 'ended':
      return { variant: 'success', text: '완료' };
    case 'scheduled':
      return { variant: 'secondary', text: '예정' };
    default:
      return { variant: 'secondary', text: status };
  }
}

export default function MeetingNoteCard({ note }: MeetingNoteCardProps) {
  const statusBadge = getStatusBadge(note.status);
  const linkHref = note.status === 'live'
    ? `/live?channel=${note.id}`
    : `/notes/${note.id}`;

  return (
    <Link href={linkHref} className="block">
      <div className="bg-white rounded-lg border border-gray-200 p-5 hover-lift cursor-pointer group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
              {note.title}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(note.meeting_date)}
            </p>
          </div>
          <Badge variant={statusBadge.variant}>{statusBadge.text}</Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          {/* 자막 수 */}
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>{note.subtitle_count > 0 ? `자막 ${note.subtitle_count}개` : '자막 없음'}</span>
          </div>

          {/* 재생 시간 */}
          {note.duration_seconds && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDuration(note.duration_seconds)}</span>
            </div>
          )}

          {/* VOD 유무 */}
          {note.vod_url && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>VOD</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
