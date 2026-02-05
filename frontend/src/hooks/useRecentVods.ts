/**
 * useRecentVods 훅
 *
 * 최근 VOD 목록을 가져옵니다 (processing, ended 상태).
 */

'use client';

import useSWR from 'swr';

import { apiClient } from '@/lib/api';
import type { MeetingType } from '@/types';

const DEFAULT_LIMIT = 5;

export interface UseRecentVodsResult {
  vods: MeetingType[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

export interface UseRecentVodsOptions {
  limit?: number;
}

interface VodsResponse {
  data: MeetingType[] | null;
}

/**
 * SWR fetcher 함수
 */
async function fetcher(endpoint: string): Promise<VodsResponse> {
  return apiClient<VodsResponse>(endpoint);
}

/**
 * 최근 VOD 목록을 가져오는 훅
 *
 * @param options - 옵션 (limit: 가져올 VOD 개수)
 * @returns VOD 목록, 로딩 상태, 에러, mutate 함수
 *
 * @example
 * ```tsx
 * const { vods, isLoading, error } = useRecentVods({ limit: 5 });
 *
 * if (isLoading) return <div>로딩 중...</div>;
 * if (error) return <div>에러 발생</div>;
 * if (vods.length === 0) return <div>VOD가 없습니다</div>;
 *
 * return (
 *   <ul>
 *     {vods.map(vod => <li key={vod.id}>{vod.title}</li>)}
 *   </ul>
 * );
 * ```
 */
export function useRecentVods(options?: UseRecentVodsOptions): UseRecentVodsResult {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const endpoint = `/api/meetings?status=processing,ended&limit=${limit}`;

  const { data, error, isLoading, mutate } = useSWR<VodsResponse>(
    endpoint,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30초 동안 캐시 유지
      errorRetryCount: 3,
      errorRetryInterval: 1000,
    }
  );

  return {
    vods: data?.data ?? [],
    isLoading,
    error: error ?? null,
    mutate: () => {
      mutate();
    },
  };
}

export default useRecentVods;
