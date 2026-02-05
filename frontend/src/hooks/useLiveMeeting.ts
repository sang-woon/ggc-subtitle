/**
 * useLiveMeeting 훅
 *
 * 실시간 회의 정보를 가져오고 5초마다 폴링합니다.
 */

'use client';

import useSWR from 'swr';

import { apiClient } from '@/lib/api';
import type { MeetingType } from '@/types';

const POLLING_INTERVAL = 5000; // 5초

export interface UseLiveMeetingResult {
  meeting: MeetingType | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * SWR fetcher 함수
 */
async function fetcher(endpoint: string): Promise<MeetingType | null> {
  return apiClient<MeetingType | null>(endpoint);
}

/**
 * 실시간 회의 정보를 가져오는 훅
 *
 * @returns 실시간 회의 데이터, 로딩 상태, 에러, mutate 함수
 *
 * @example
 * ```tsx
 * const { meeting, isLoading, error } = useLiveMeeting();
 *
 * if (isLoading) return <div>로딩 중...</div>;
 * if (error) return <div>에러 발생</div>;
 * if (!meeting) return <div>진행 중인 회의가 없습니다</div>;
 *
 * return <div>{meeting.title}</div>;
 * ```
 */
export function useLiveMeeting(): UseLiveMeetingResult {
  const { data, error, isLoading, mutate } = useSWR<MeetingType | null>(
    '/api/meetings/live',
    fetcher,
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
    }
  );

  return {
    meeting: data ?? null,
    isLoading,
    error: error ?? null,
    mutate: () => {
      mutate();
    },
  };
}

export default useLiveMeeting;
