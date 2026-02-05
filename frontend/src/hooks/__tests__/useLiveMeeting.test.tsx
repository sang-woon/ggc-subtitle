/**
 * useLiveMeeting 훅 테스트
 *
 * 테스트 케이스:
 * 1. 실시간 회의 데이터 가져오기
 * 2. 실시간 회의 없을 때 null 반환
 * 3. 로딩 상태 처리
 * 4. 에러 상태 처리
 * 5. 5초 폴링 동작
 */

import type { ReactNode } from 'react';

import { renderHook, waitFor, act } from '@testing-library/react';
import { SWRConfig } from 'swr';

import { apiClient } from '@/lib/api';
import type { MeetingType } from '@/types';

import { useLiveMeeting } from '../useLiveMeeting';

// Mock the API client
jest.mock('@/lib/api', () => ({
  apiClient: jest.fn(),
  API_BASE_URL: 'http://localhost:8000',
}));

const mockApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

// Mock meeting data
const mockLiveMeeting: MeetingType = {
  id: 'meeting-1',
  title: '제123회 본회의',
  meeting_date: '2026-02-05',
  stream_url: 'https://stream.example.com/live/playlist.m3u8',
  vod_url: null,
  status: 'live',
  duration_seconds: null,
  created_at: '2026-02-05T09:00:00Z',
  updated_at: '2026-02-05T09:00:00Z',
};

// SWR test wrapper to disable cache between tests
function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

const createWrapper = () => TestWrapper;

describe('useLiveMeeting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Data fetching', () => {
    it('should fetch live meeting data successfully', async () => {
      mockApiClient.mockResolvedValueOnce(mockLiveMeeting);

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      // 초기 로딩 상태
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meeting).toEqual(mockLiveMeeting);
      expect(result.current.error).toBeNull();
      expect(mockApiClient).toHaveBeenCalledWith('/api/meetings/live');
    });

    it('should return null when no live meeting exists', async () => {
      // API가 404 또는 null 반환할 때
      mockApiClient.mockResolvedValueOnce(null);

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meeting).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('Loading state', () => {
    it('should show loading state while fetching', async () => {
      // 지연된 응답 시뮬레이션
      mockApiClient.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockLiveMeeting), 100);
          })
      );

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.meeting).toBeNull();

      // 타이머 진행
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meeting).toEqual(mockLiveMeeting);
    });
  });

  describe('Error handling', () => {
    it('should handle API error gracefully', async () => {
      const error = new Error('API Error');
      mockApiClient.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.meeting).toBeNull();
    });

    it('should handle network error', async () => {
      mockApiClient.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.meeting).toBeNull();
    });
  });

  describe('Polling', () => {
    it('should poll every 5 seconds', async () => {
      mockApiClient.mockResolvedValue(mockLiveMeeting);

      renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      // 초기 호출
      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledTimes(1);
      });

      // 5초 후
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledTimes(2);
      });

      // 10초 후
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledTimes(3);
      });
    });

    it('should update data when meeting status changes', async () => {
      const updatedMeeting = { ...mockLiveMeeting, status: 'ended' as const };

      mockApiClient
        .mockResolvedValueOnce(mockLiveMeeting)
        .mockResolvedValueOnce(updatedMeeting);

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.meeting?.status).toBe('live');
      });

      // 5초 후 폴링
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.meeting?.status).toBe('ended');
      });
    });
  });

  describe('Mutate', () => {
    it('should provide mutate function to manually refresh', async () => {
      mockApiClient.mockResolvedValue(mockLiveMeeting);

      const { result } = renderHook(() => useLiveMeeting(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.mutate).toBe('function');

      // mutate 호출
      await act(async () => {
        result.current.mutate();
      });

      // mutate 후 API 재호출 확인
      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledTimes(2);
      });
    });
  });
});
