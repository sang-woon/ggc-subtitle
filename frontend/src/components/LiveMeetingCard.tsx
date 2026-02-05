'use client';

import React from 'react';

import { useRouter } from 'next/navigation';

import type { MeetingType } from '@/types';

import Badge from './Badge';

export interface LiveMeetingCardProps {
  meeting: MeetingType | null;
  className?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function LiveMeetingCard({ meeting, className = '' }: LiveMeetingCardProps) {
  const router = useRouter();

  const handleWatchClick = () => {
    router.push('/live');
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`.trim()}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">실시간 회의</h2>

      {meeting ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="live">Live</Badge>
            <span className="text-gray-500 text-sm">{formatDate(meeting.meeting_date)}</span>
          </div>

          <h3 className="text-xl font-bold text-gray-900">{meeting.title}</h3>

          <button
            onClick={handleWatchClick}
            className="w-full px-4 py-3 bg-primary text-white rounded-md font-medium hover:bg-primary-light active:bg-primary-dark transition-colors"
          >
            실시간 자막 보기
          </button>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-gray-500">현재 진행 중인 회의가 없습니다</p>
        </div>
      )}
    </div>
  );
}
