'use client';

import { useState, useCallback, useRef } from 'react';

export type BatchStatus = 'idle' | 'downloading' | 'transcribing' | 'polling' | 'completed' | 'failed';

export interface BatchSubtitle {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: number;
  isFinal: boolean;
}

export interface BatchTranscribeResult {
  success: boolean;
  transcribeId?: string;
  subtitles?: BatchSubtitle[];
  totalDuration?: number;
  error?: string;
}

export interface UseBatchTranscribeReturn {
  status: BatchStatus;
  progress: number;
  subtitles: BatchSubtitle[];
  error: string | null;
  estimatedTime: string | null;
  startTranscription: (videoUrl: string, sessionId?: string) => Promise<void>;
  startAsyncTranscription: (videoUrl: string) => Promise<string | null>;
  checkStatus: (transcribeId: string) => Promise<void>;
  reset: () => void;
}

/**
 * MP4 배치 전사 훅
 */
export function useBatchTranscribe(): UseBatchTranscribeReturn {
  const [status, setStatus] = useState<BatchStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [subtitles, setSubtitles] = useState<BatchSubtitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 전사 시작 (동기 방식 - 완료까지 대기)
   */
  const startTranscription = useCallback(async (videoUrl: string, sessionId?: string) => {
    try {
      // 이전 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setStatus('downloading');
      setProgress(0);
      setError(null);
      setSubtitles([]);

      console.log('[BatchHook] Starting transcription for:', videoUrl);

      // 다운로드 → 전사 시작 표시
      setTimeout(() => {
        setStatus('transcribing');
        setProgress(10);
      }, 2000);

      // API 호출 (긴 시간 소요될 수 있음)
      const response = await fetch('/api/rtzr/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl, sessionId }),
        signal: abortControllerRef.current.signal,
      });

      const result: BatchTranscribeResult = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Transcription failed');
      }

      setSubtitles(result.subtitles || []);
      setProgress(100);
      setStatus('completed');

      console.log('[BatchHook] Transcription completed, subtitles:', result.subtitles?.length);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[BatchHook] Transcription aborted');
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[BatchHook] Error:', errorMessage);
      setError(errorMessage);
      setStatus('failed');
    }
  }, []);

  /**
   * 비동기 전사 시작 (바로 반환, 폴링으로 결과 확인)
   */
  const startAsyncTranscription = useCallback(async (videoUrl: string): Promise<string | null> => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setStatus('downloading');
      setProgress(5);
      setError(null);
      setSubtitles([]);

      // 영상 길이 기반 예상 시간 계산
      const durationMin = 60; // 기본 1시간 가정
      const minTime = Math.ceil(durationMin * 0.25);
      const maxTime = Math.ceil(durationMin * 0.5);
      setEstimatedTime(`${minTime}~${maxTime}분`);

      console.log('[BatchHook] Starting async transcription for:', videoUrl);

      // 전사 작업 시작만 요청
      const response = await fetch('/api/rtzr/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl, async: true }),
        signal: abortControllerRef.current.signal,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start transcription');
      }

      setStatus('polling');
      setProgress(10);

      // transcribeId 반환 (폴링용)
      return result.transcribeId || null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus('failed');
      return null;
    }
  }, []);

  /**
   * 전사 상태 확인 (비동기 폴링용)
   */
  const checkStatus = useCallback(async (transcribeId: string) => {
    try {
      const response = await fetch(`/api/rtzr/batch?id=${transcribeId}`);
      const result = await response.json();

      if (result.status === 'completed') {
        setSubtitles(result.subtitles || []);
        setProgress(100);
        setStatus('completed');
        setEstimatedTime(null);

        // 폴링 중지
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else if (result.status === 'failed') {
        setError(result.error || 'Transcription failed');
        setStatus('failed');

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        // 진행 중
        const currentProgress = Math.min(90, progress + 5);
        setProgress(currentProgress);
        setStatus('polling');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Status check failed';
      setError(errorMessage);
      setStatus('failed');
    }
  }, [progress]);

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
    setSubtitles([]);
    setError(null);
    setEstimatedTime(null);
  }, []);

  return {
    status,
    progress,
    subtitles,
    error,
    estimatedTime,
    startTranscription,
    startAsyncTranscription,
    checkStatus,
    reset,
  };
}
