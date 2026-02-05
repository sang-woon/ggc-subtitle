'use client';

import useSWR from 'swr';

import { apiClient } from '@/lib/api';
import type { MeetingType } from '@/types';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;

export interface UseVodListOptions {
  page?: number;
  perPage?: number;
}

export interface UseVodListResult {
  vods: MeetingType[];
  isLoading: boolean;
  error: Error | null;
  total: number;
  page: number;
  perPage: number;
  hasNext: boolean;
  totalPages: number;
  mutate: () => void;
}

interface VodListResponse {
  data: MeetingType[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

/**
 * SWR fetcher for VOD list
 */
async function fetcher(endpoint: string): Promise<VodListResponse> {
  return apiClient<VodListResponse>(endpoint);
}

/**
 * VOD 목록을 가져오는 훅
 *
 * processing 및 ended 상태의 회의 목록을 페이지네이션과 함께 제공합니다.
 *
 * @param options - 옵션 (page, perPage)
 * @returns VOD 목록, 로딩 상태, 에러, 페이지네이션 정보
 */
export function useVodList(options?: UseVodListOptions): UseVodListResult {
  const page = options?.page ?? DEFAULT_PAGE;
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;

  const endpoint = `/api/meetings?status=processing,ended&page=${page}&per_page=${perPage}`;

  const { data, error, isLoading, mutate } = useSWR<VodListResponse>(
    endpoint,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
    }
  );

  const total = data?.total ?? 0;
  const responsePerPage = data?.per_page ?? perPage;
  const totalPages = responsePerPage > 0 ? Math.ceil(total / responsePerPage) : 0;

  return {
    vods: data?.data ?? [],
    isLoading,
    error: error ?? null,
    total,
    page: data?.page ?? page,
    perPage: responsePerPage,
    hasNext: data?.has_next ?? false,
    totalPages,
    mutate: () => {
      mutate();
    },
  };
}

export default useVodList;
