'use client';

import useSWR from 'swr';

import { apiClient } from '@/lib/api';
import type { GlobalSearchResponse, SearchGroupType } from '@/types';

export interface UseGlobalSearchOptions {
  query: string;
  limit?: number;
  offset?: number;
}

export interface UseGlobalSearchResult {
  results: SearchGroupType[];
  total: number;
  isLoading: boolean;
  error: Error | null;
}

async function fetcher(endpoint: string): Promise<GlobalSearchResponse> {
  return apiClient<GlobalSearchResponse>(endpoint);
}

/**
 * 모든 회의의 자막에서 키워드를 검색하는 훅
 */
export function useGlobalSearch(options: UseGlobalSearchOptions): UseGlobalSearchResult {
  const { query, limit = 20, offset = 0 } = options;

  const endpoint = query.trim()
    ? `/api/search?q=${encodeURIComponent(query.trim())}&limit=${limit}&offset=${offset}`
    : null;

  const { data, error, isLoading } = useSWR<GlobalSearchResponse>(
    endpoint,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  return {
    results: data?.grouped ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
  };
}

export default useGlobalSearch;
