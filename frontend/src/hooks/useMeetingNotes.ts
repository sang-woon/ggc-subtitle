'use client';

import useSWR from 'swr';

import { apiClient } from '@/lib/api';
import type { MeetingNoteType, MeetingNotesResponse } from '@/types';

export interface UseMeetingNotesOptions {
  page?: number;
  perPage?: number;
}

export interface UseMeetingNotesResult {
  notes: MeetingNoteType[];
  isLoading: boolean;
  error: Error | null;
  total: number;
  totalPages: number;
  mutate: () => void;
}

async function fetcher(endpoint: string): Promise<MeetingNotesResponse> {
  return apiClient<MeetingNotesResponse>(endpoint);
}

/**
 * 회의록 목록을 자막 수와 함께 가져오는 훅
 */
export function useMeetingNotes(options?: UseMeetingNotesOptions): UseMeetingNotesResult {
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 20;
  const offset = (page - 1) * perPage;

  const endpoint = `/api/meetings/notes?limit=${perPage}&offset=${offset}`;

  const { data, error, isLoading, mutate } = useSWR<MeetingNotesResponse>(
    endpoint,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      errorRetryCount: 3,
    }
  );

  const total = data?.total ?? 0;
  const totalPages = perPage > 0 ? Math.ceil(total / perPage) : 0;

  return {
    notes: data?.items ?? [],
    isLoading,
    error: error ?? null,
    total,
    totalPages,
    mutate: () => { mutate(); },
  };
}

export default useMeetingNotes;
