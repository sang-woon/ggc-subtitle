'use client';

import { useState, useCallback, useRef } from 'react';

export type BatchStatus = 'idle' | 'downloading' | 'transcribing' | 'completed' | 'failed';

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
  startTranscription: (videoUrl: string, sessionId?: string) => Promise<void>;
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
  const abortControllerRef = useRef<AbortController | null>(null);

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
      } else if (result.status === 'failed') {
        setError(result.error || 'Transcription failed');
        setStatus('failed');
      } else {
        setProgress(result.progress || 50);
        setStatus('transcribing');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Status check failed';
      setError(errorMessage);
      setStatus('failed');
    }
  }, []);

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus('idle');
    setProgress(0);
    setSubtitles([]);
    setError(null);
  }, []);

  return {
    status,
    progress,
    subtitles,
    error,
    startTranscription,
    checkStatus,
    reset,
  };
}
