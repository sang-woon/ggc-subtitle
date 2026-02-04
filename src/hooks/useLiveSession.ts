'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export type LiveSessionRole = 'leader' | 'follower' | 'idle';

interface LiveSubtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  isFinal: boolean;
  speaker?: number | null;
  timestamp: number;
}

interface UseLiveSessionOptions {
  channelCode: string;
  onSubtitle?: (subtitle: LiveSubtitle) => void;
  onRoleChange?: (role: LiveSessionRole) => void;
  onError?: (error: Error) => void;
}

interface UseLiveSessionReturn {
  role: LiveSessionRole;
  isConnected: boolean;
  isConnecting: boolean;
  currentLeaderId: string | null;
  clientId: string;
  // 리더 전용: 자막 브로드캐스트
  broadcastSubtitle: (subtitle: LiveSubtitle) => void;
  // 세션 시작/종료
  connect: () => Promise<void>;
  disconnect: () => void;
}

const HEARTBEAT_INTERVAL_MS = 5000; // 5초마다 heartbeat
const LEADER_CHECK_INTERVAL_MS = 3000; // 3초마다 리더 체크 (follower용)

/**
 * 고유 클라이언트 ID 생성
 */
function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 라이브 세션 훅 - Leader Election + Supabase Realtime
 *
 * 리더: 오디오 캡처 → RTZR 전사 → 자막 브로드캐스트
 * 팔로워: Supabase Realtime 구독 → 자막 수신
 */
export function useLiveSession(options: UseLiveSessionOptions): UseLiveSessionReturn {
  const { channelCode, onSubtitle, onRoleChange, onError } = options;

  const [role, setRole] = useState<LiveSessionRole>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentLeaderId, setCurrentLeaderId] = useState<string | null>(null);

  const clientIdRef = useRef<string>(generateClientId());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const leaderCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleaningUpRef = useRef(false);

  // 역할 변경 시 콜백 호출
  const updateRole = useCallback((newRole: LiveSessionRole) => {
    setRole(newRole);
    onRoleChange?.(newRole);
  }, [onRoleChange]);

  // Supabase Realtime 채널 구독 (팔로워용)
  const subscribeToChannel = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`live-subtitles:${channelCode}`)
      .on('broadcast', { event: 'subtitle' }, (payload) => {
        const subtitle = payload.payload as LiveSubtitle;
        onSubtitle?.(subtitle);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[LiveSession] Subscribed to channel: ${channelCode}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[LiveSession] Channel subscription error');
          onError?.(new Error('Failed to subscribe to live channel'));
        }
      });

    channelRef.current = channel;
  }, [channelCode, onSubtitle, onError]);

  // 자막 브로드캐스트 (리더 전용)
  const broadcastSubtitle = useCallback((subtitle: LiveSubtitle) => {
    if (role !== 'leader') {
      console.warn('[LiveSession] Only leader can broadcast subtitles');
      return;
    }

    supabase
      .channel(`live-subtitles:${channelCode}`)
      .send({
        type: 'broadcast',
        event: 'subtitle',
        payload: subtitle,
      })
      .then(() => {
        // console.log('[LiveSession] Subtitle broadcasted');
      })
      .catch((error) => {
        console.error('[LiveSession] Broadcast error:', error);
      });
  }, [role, channelCode]);

  // 리더 heartbeat
  const sendHeartbeat = useCallback(async () => {
    try {
      const response = await fetch('/api/live/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelCode,
          clientId: clientIdRef.current,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        // 더 이상 리더가 아님 - 팔로워로 전환
        console.log('[LiveSession] Lost leader status, becoming follower');
        updateRole('follower');
        subscribeToChannel();

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('[LiveSession] Heartbeat error:', error);
    }
  }, [channelCode, updateRole, subscribeToChannel]);

  // 리더 체크 (팔로워용 - 리더가 죽으면 리더 승계 시도)
  const checkLeaderStatus = useCallback(async () => {
    if (role !== 'follower' || isCleaningUpRef.current) return;

    try {
      const response = await fetch(`/api/live/session?channel=${encodeURIComponent(channelCode)}`);
      const data = await response.json();

      if (data.canBecomeLeader) {
        // 리더가 없음 - 리더 승계 시도
        console.log('[LiveSession] Leader is gone, attempting to become leader');

        const registerResponse = await fetch('/api/live/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelCode,
            clientId: clientIdRef.current,
          }),
        });

        const registerData = await registerResponse.json();

        if (registerData.success && registerData.role === 'leader') {
          console.log('[LiveSession] Successfully became leader');
          updateRole('leader');
          setCurrentLeaderId(clientIdRef.current);

          // 팔로워 체크 중지, heartbeat 시작
          if (leaderCheckIntervalRef.current) {
            clearInterval(leaderCheckIntervalRef.current);
            leaderCheckIntervalRef.current = null;
          }

          heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        }
      } else if (data.leader) {
        setCurrentLeaderId(data.leader.id);
      }
    } catch (error) {
      console.error('[LiveSession] Leader check error:', error);
    }
  }, [role, channelCode, updateRole, sendHeartbeat]);

  // 세션 연결
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    isCleaningUpRef.current = false;

    try {
      // 1. 현재 리더 확인
      const response = await fetch(`/api/live/session?channel=${encodeURIComponent(channelCode)}`);
      const data = await response.json();

      if (data.canBecomeLeader) {
        // 2a. 리더가 없음 - 리더로 등록
        const registerResponse = await fetch('/api/live/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelCode,
            clientId: clientIdRef.current,
          }),
        });

        const registerData = await registerResponse.json();

        if (registerData.success && registerData.role === 'leader') {
          console.log('[LiveSession] Registered as leader');
          updateRole('leader');
          setCurrentLeaderId(clientIdRef.current);

          // Heartbeat 시작
          heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        } else {
          // 경쟁에서 패배 - 팔로워로
          console.log('[LiveSession] Lost leader election, becoming follower');
          updateRole('follower');
          setCurrentLeaderId(registerData.leader?.id || null);
          subscribeToChannel();

          // 리더 체크 시작
          leaderCheckIntervalRef.current = setInterval(checkLeaderStatus, LEADER_CHECK_INTERVAL_MS);
        }
      } else {
        // 2b. 이미 리더가 있음 - 팔로워로
        console.log('[LiveSession] Existing leader found, becoming follower');
        updateRole('follower');
        setCurrentLeaderId(data.leader?.id || null);
        subscribeToChannel();

        // 리더 체크 시작 (리더가 죽으면 승계)
        leaderCheckIntervalRef.current = setInterval(checkLeaderStatus, LEADER_CHECK_INTERVAL_MS);
      }

      setIsConnected(true);
    } catch (error) {
      console.error('[LiveSession] Connect error:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to connect'));
    } finally {
      setIsConnecting(false);
    }
  }, [channelCode, isConnecting, isConnected, updateRole, subscribeToChannel, sendHeartbeat, checkLeaderStatus, onError]);

  // 세션 종료
  const disconnect = useCallback(() => {
    isCleaningUpRef.current = true;

    // Heartbeat 중지
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // 리더 체크 중지
    if (leaderCheckIntervalRef.current) {
      clearInterval(leaderCheckIntervalRef.current);
      leaderCheckIntervalRef.current = null;
    }

    // Realtime 채널 구독 해제
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    // 리더였으면 세션 종료 알림
    if (role === 'leader') {
      fetch('/api/live/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelCode,
          clientId: clientIdRef.current,
        }),
      }).catch(console.error);
    }

    setIsConnected(false);
    updateRole('idle');
    setCurrentLeaderId(null);
  }, [role, channelCode, updateRole]);

  // 컴포넌트 언마운트 시 정리
  // NOTE: 빈 의존성 배열 사용 - disconnect 함수 변경 시마다 cleanup이 실행되는 것을 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      // 언마운트 시에만 정리 작업 수행 (ref 사용으로 최신 상태 접근)
      isCleaningUpRef.current = true;

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (leaderCheckIntervalRef.current) {
        clearInterval(leaderCheckIntervalRef.current);
        leaderCheckIntervalRef.current = null;
      }

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, []);

  return {
    role,
    isConnected,
    isConnecting,
    currentLeaderId,
    clientId: clientIdRef.current,
    broadcastSubtitle,
    connect,
    disconnect,
  };
}
