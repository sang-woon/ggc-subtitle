import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import React from 'react';

import type { MeetingType } from '@/types';

import { useVodList } from '../useVodList';

// Mock the api module
jest.mock('@/lib/api', () => ({
  apiClient: jest.fn(),
}));

import { apiClient } from '@/lib/api';

const mockedApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

describe('useVodList', () => {
  const mockVods: MeetingType[] = [
    {
      id: 'vod-1',
      title: '제122회 본회의',
      meeting_date: '2026-02-04',
      stream_url: null,
      vod_url: 'https://vod.example.com/122',
      status: 'ended',
      duration_seconds: 5400,
      created_at: '2026-02-04T09:00:00Z',
      updated_at: '2026-02-04T11:30:00Z',
    },
    {
      id: 'vod-2',
      title: '제121회 상임위원회',
      meeting_date: '2026-02-03',
      stream_url: null,
      vod_url: 'https://vod.example.com/121',
      status: 'processing',
      duration_seconds: 7200,
      created_at: '2026-02-03T09:00:00Z',
      updated_at: '2026-02-03T11:00:00Z',
    },
  ];

  const mockResponse = {
    data: mockVods,
    total: 15,
    page: 1,
    per_page: 10,
    has_next: true,
  };

  // Wrapper to provide SWR config
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApiClient.mockResolvedValue(mockResponse);
  });

  describe('Initial State', () => {
    it('returns loading state initially', () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.vods).toEqual([]);
    });
  });

  describe('Data Fetching', () => {
    it('fetches VOD list from API', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('/api/meetings')
      );
      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('status=processing,ended')
      );
    });

    it('returns VOD data after fetch', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.vods).toEqual(mockVods);
    });
  });

  describe('Pagination Support', () => {
    it('sends page parameter to API', async () => {
      const { result } = renderHook(() => useVodList({ page: 2 }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('page=2')
      );
    });

    it('sends per_page parameter to API', async () => {
      const { result } = renderHook(
        () => useVodList({ page: 1, perPage: 20 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('per_page=20')
      );
    });

    it('returns pagination info', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.total).toBe(15);
      expect(result.current.page).toBe(1);
      expect(result.current.perPage).toBe(10);
      expect(result.current.hasNext).toBe(true);
    });

    it('calculates totalPages correctly', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // total: 15, per_page: 10 => 2 pages
      expect(result.current.totalPages).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('returns error when API fails', async () => {
      const mockError = new Error('Network error');
      mockedApiClient.mockRejectedValue(mockError);

      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error).toBe(mockError);
      expect(result.current.vods).toEqual([]);
    });
  });

  describe('Mutate Function', () => {
    it('provides mutate function for refetching', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.mutate).toBe('function');
    });
  });

  describe('Default Values', () => {
    it('uses default page=1 when not specified', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('page=1')
      );
    });

    it('uses default per_page=10 when not specified', async () => {
      const { result } = renderHook(() => useVodList(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedApiClient).toHaveBeenCalledWith(
        expect.stringContaining('per_page=10')
      );
    });
  });
});
