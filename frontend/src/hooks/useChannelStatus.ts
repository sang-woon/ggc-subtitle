'use client';

import { useCallback, useEffect, useRef } from 'react';

import useSWR from 'swr';

import { apiClient, API_BASE_URL } from '@/lib/api';
import type { ChannelType } from '@/types';

async function fetcher(endpoint: string): Promise<ChannelType[]> {
  return apiClient<ChannelType[]>(endpoint);
}

export interface StatusChange {
  code: string;
  old_status: number | null;
  new_status: number | null;
  old_text: string | null;
  new_text: string | null;
}

export interface UseChannelStatusOptions {
  /** SWR 폴링 간격 (ms). 기본값 5000 */
  pollingInterval?: number;
  /** 브라우저 알림 활성화 여부. 기본값 true */
  enableNotifications?: boolean;
  /** 상태 변경 콜백 */
  onStatusChange?: (changes: StatusChange[]) => void;
}

export interface UseChannelStatusResult {
  channels: ChannelType[];
  isLoading: boolean;
  error: Error | null;
  /** 알림 권한 요청 */
  requestNotificationPermission: () => Promise<NotificationPermission | null>;
}

/**
 * 채널 방송 상태를 실시간으로 추적하는 훅.
 *
 * - SWR 폴링 (5초)으로 기본 업데이트
 * - SSE 연결로 실시간 변경 수신
 * - 방송 시작 시 브라우저 알림 발송
 */
export function useChannelStatus(
  options: UseChannelStatusOptions = {}
): UseChannelStatusResult {
  const {
    pollingInterval = 5000,
    enableNotifications = true,
    onStatusChange,
  } = options;

  const { data, error, isLoading, mutate } = useSWR<ChannelType[]>(
    '/api/channels/status',
    fetcher,
    { refreshInterval: pollingInterval }
  );

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const prevChannelsRef = useRef<Map<string, number>>(new Map());

  // 채널 이름 조회 헬퍼
  const getChannelName = useCallback(
    (code: string): string => {
      const ch = data?.find((c) => c.code === code);
      return ch?.name ?? code;
    },
    [data]
  );

  // 브라우저 알림 발송
  const sendNotification = useCallback(
    (changes: StatusChange[]) => {
      if (!enableNotifications) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      for (const change of changes) {
        // 방송 시작 (0→1) 알림만 발송
        if (change.new_status === 1 && change.old_status !== 1) {
          const channelName = getChannelName(change.code);
          const notification = new Notification(`${channelName} 방송 시작`, {
            body: `경기도의회 ${channelName} 생중계가 시작되었습니다.`,
            icon: '/favicon.ico',
            tag: `live-${change.code}`,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      }
    },
    [enableNotifications, getChannelName]
  );

  // SSE 연결
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = `${API_BASE_URL}/api/channels/status/stream`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('status_change', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const channels: ChannelType[] = payload.channels;
        const changes: StatusChange[] = payload.changes;

        // SWR 캐시 업데이트
        mutate(channels, false);

        // 콜백 호출
        onStatusChangeRef.current?.(changes);

        // 브라우저 알림
        sendNotification(changes);
      } catch (e) {
        // JSON 파싱 실패 무시
      }
    });

    eventSource.onerror = () => {
      // EventSource는 자동 재연결함 — 별도 처리 불필요
    };

    return () => {
      eventSource.close();
    };
  }, [mutate, sendNotification]);

  // SWR 데이터 변경 시 로컬 상태 변경 감지 (SSE 없이 폴링만으로도 작동)
  useEffect(() => {
    if (!data) return;

    const changes: StatusChange[] = [];
    const newMap = new Map<string, number>();

    for (const ch of data) {
      const status = ch.livestatus ?? 0;
      newMap.set(ch.code, status);

      const prev = prevChannelsRef.current.get(ch.code);
      if (prev !== undefined && prev !== status) {
        changes.push({
          code: ch.code,
          old_status: prev,
          new_status: status,
          old_text: null,
          new_text: ch.status_text ?? null,
        });
      }
    }

    prevChannelsRef.current = newMap;

    if (changes.length > 0) {
      onStatusChangeRef.current?.(changes);
      sendNotification(changes);
    }
  }, [data, sendNotification]);

  // 알림 권한 요청
  const requestNotificationPermission =
    useCallback(async (): Promise<NotificationPermission | null> => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return null;
      }
      return Notification.requestPermission();
    }, []);

  return {
    channels: data ?? [],
    isLoading,
    error: error ?? null,
    requestNotificationPermission,
  };
}

export default useChannelStatus;
