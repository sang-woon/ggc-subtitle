/**
 * useSubtitleWebSocket 훅
 *
 * WebSocket을 통해 실시간 자막을 수신하는 훅입니다.
 *
 * 특징:
 * - WebSocket 연결 관리 (/ws/meetings/{id}/subtitles)
 * - subtitle_created 이벤트 처리
 * - 자동 재연결 (exponential backoff)
 * - 연결 상태 관리
 * - 자막 배열 상태 관리
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import type { SubtitleType } from '@/types';

/**
 * 연결 상태 타입
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * 훅 옵션 인터페이스
 */
export interface UseSubtitleWebSocketOptions {
  /** 회의 ID */
  meetingId: string;
  /** 자막 수신 시 호출되는 콜백 */
  onSubtitle?: (subtitle: SubtitleType) => void;
  /** 자동 연결 여부 (기본값: true) */
  autoConnect?: boolean;
}

/**
 * 훅 반환 인터페이스
 */
export interface UseSubtitleWebSocketReturn {
  /** 수신된 자막 배열 */
  subtitles: SubtitleType[];
  /** 연결 상태 */
  connectionStatus: ConnectionStatus;
  /** 수동 연결 함수 */
  connect: () => void;
  /** 수동 해제 함수 */
  disconnect: () => void;
  /** 자막 배열 초기화 함수 */
  clearSubtitles: () => void;
}

/**
 * WebSocket 메시지 타입
 */
interface SubtitleCreatedEvent {
  type: 'subtitle_created';
  payload: {
    subtitle: SubtitleType;
  };
}

interface WebSocketMessage {
  type: string;
  payload: unknown;
}

/**
 * 재연결 설정
 */
const RECONNECT_CONFIG = {
  initialDelay: 1000, // 1초
  maxDelay: 30000, // 30초
  backoffMultiplier: 2,
};

/**
 * WebSocket URL 생성
 */
function getWebSocketUrl(meetingId: string): string {
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
  return `${wsBaseUrl}/ws/meetings/${meetingId}/subtitles`;
}

/**
 * 실시간 자막 WebSocket 훅
 *
 * @param options - 훅 옵션
 * @returns WebSocket 연결 상태 및 제어 함수
 *
 * @example
 * ```tsx
 * const { subtitles, connectionStatus, connect, disconnect, clearSubtitles } =
 *   useSubtitleWebSocket({
 *     meetingId: 'meeting-1',
 *     onSubtitle: (subtitle) => console.log('New subtitle:', subtitle),
 *   });
 *
 * if (connectionStatus === 'connected') {
 *   return <SubtitlePanel subtitles={subtitles} />;
 * }
 * ```
 */
export function useSubtitleWebSocket(
  options: UseSubtitleWebSocketOptions
): UseSubtitleWebSocketReturn {
  const { meetingId, onSubtitle, autoConnect = true } = options;

  // State
  const [subtitles, setSubtitles] = useState<SubtitleType[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    autoConnect ? 'connecting' : 'disconnected'
  );

  // Refs for WebSocket and reconnection logic
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);
  const isReplacingConnectionRef = useRef(false);
  const isMountedRef = useRef(true);
  const onSubtitleRef = useRef(onSubtitle);

  // Update onSubtitle ref when it changes
  useEffect(() => {
    onSubtitleRef.current = onSubtitle;
  }, [onSubtitle]);

  /**
   * 재연결 지연 시간 계산 (exponential backoff)
   */
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelay *
        Math.pow(RECONNECT_CONFIG.backoffMultiplier, reconnectAttemptRef.current),
      RECONNECT_CONFIG.maxDelay
    );
    return delay;
  }, []);

  /**
   * 재연결 타이머 정리
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * WebSocket 연결 생성
   */
  const createConnection = useCallback(() => {
    if (!isMountedRef.current) return;

    // 기존 연결 정리 (onclose 핸들러가 재연결하지 않도록 플래그 설정)
    if (wsRef.current) {
      isReplacingConnectionRef.current = true;
      wsRef.current.close();
      isReplacingConnectionRef.current = false;
    }

    clearReconnectTimeout();

    const url = getWebSocketUrl(meetingId);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConnectionStatus('connecting');

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setConnectionStatus('connected');
      reconnectAttemptRef.current = 0; // 연결 성공 시 재연결 시도 횟수 초기화
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;

      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'subtitle_created') {
          const subtitleEvent = message as SubtitleCreatedEvent;
          const newSubtitle = subtitleEvent.payload.subtitle;

          setSubtitles((prev) => [...prev, newSubtitle]);

          if (onSubtitleRef.current) {
            onSubtitleRef.current(newSubtitle);
          }
        }
        // 다른 이벤트 타입은 무시 (예: meeting_status_changed)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = () => {
      if (!isMountedRef.current) return;
      setConnectionStatus('error');
    };

    ws.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current) return;

      // 연결 교체 중이면 무시 (새 연결 생성 시 기존 연결 정리)
      if (isReplacingConnectionRef.current) return;

      // 수동 해제가 아니고 비정상 종료인 경우 재연결 시도
      if (!isManualDisconnectRef.current && !event.wasClean) {
        setConnectionStatus('connecting');
        const delay = getReconnectDelay();
        reconnectAttemptRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && !isManualDisconnectRef.current) {
            createConnection();
          }
        }, delay);
      } else {
        setConnectionStatus('disconnected');
      }
    };
  }, [meetingId, clearReconnectTimeout, getReconnectDelay]);

  /**
   * 수동 연결
   */
  const connect = useCallback(() => {
    isManualDisconnectRef.current = false;
    createConnection();
  }, [createConnection]);

  /**
   * 수동 해제
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearReconnectTimeout();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
  }, [clearReconnectTimeout]);

  /**
   * 자막 배열 초기화
   */
  const clearSubtitles = useCallback(() => {
    setSubtitles([]);
  }, []);

  // 자동 연결 및 meetingId 변경 처리
  useEffect(() => {
    isMountedRef.current = true;
    isManualDisconnectRef.current = false;

    // meetingId 변경 시 자막 초기화
    setSubtitles([]);

    if (autoConnect) {
      createConnection();
    }

    return () => {
      isMountedRef.current = false;
      clearReconnectTimeout();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [meetingId, autoConnect, createConnection, clearReconnectTimeout]);

  return {
    subtitles,
    connectionStatus,
    connect,
    disconnect,
    clearSubtitles,
  };
}

export default useSubtitleWebSocket;
