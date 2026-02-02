'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseRtzrStreamOptions {
  sampleRate?: number;
  encoding?: string;
  domain?: string;
  // 오디오 전송 간격 (ms) - 실시간 모드에서는 300ms 이상 권장
  sendInterval?: number;
  // 실시간 스트리밍 모드 (true = SSE, false = HTTP 배치)
  realtime?: boolean;
  // 콜백: text, isFinal, speaker, rtzrSeq, startAt(ms), duration(ms)
  onTranscript?: (text: string, isFinal: boolean, speaker?: number | null, rtzrSeq?: number, startAt?: number, duration?: number) => void;
  onError?: (error: Error) => void;
}

interface UseRtzrStreamReturn {
  isConnected: boolean;
  isConnecting: boolean;
  currentTranscript: string;
  connect: (token: string) => void;
  disconnect: () => void;
  sendAudio: (audioData: ArrayBuffer) => void;
  sendEOS: () => void;
}

/**
 * RTZR STT 스트리밍 훅
 *
 * realtime=true: SSE 기반 실시간 스트리밍 (중간 결과 + 최종 결과)
 * realtime=false: HTTP 배치 모드 (최종 결과만)
 */
export function useRtzrStream(options: UseRtzrStreamOptions = {}): UseRtzrStreamReturn {
  const {
    sampleRate = 16000,
    encoding = 'LINEAR16',
    domain = 'MEETING',
    sendInterval = 300, // 실시간 모드는 300ms마다 전송 (100ms는 중복 발생)
    realtime = true, // 기본값: 실시간 모드
    onTranscript,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioBufferRef = useRef<ArrayBuffer[]>([]);
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isSendingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    audioBufferRef.current = [];
    isSendingRef.current = false;
    sessionIdRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    setCurrentTranscript('');
  }, []);

  // 실시간 모드: SSE로 오디오 전송
  const sendAudioRealtime = useCallback(async () => {
    if (audioBufferRef.current.length === 0 || !sessionIdRef.current || isSendingRef.current) {
      return;
    }

    isSendingRef.current = true;

    // 버퍼 복사 후 비우기
    const audioChunks = [...audioBufferRef.current];
    audioBufferRef.current = [];

    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    try {
      await fetch(`/api/rtzr/stream?sessionId=${sessionIdRef.current}`, {
        method: 'POST',
        body: combined.buffer,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });
    } catch (error) {
      console.error('Failed to send audio:', error);
    } finally {
      isSendingRef.current = false;
    }
  }, []);

  // HTTP 배치 모드: 기존 방식
  const sendBufferedAudioBatch = useCallback(async () => {
    if (audioBufferRef.current.length === 0 || !tokenRef.current || isSendingRef.current) {
      return;
    }

    // 최소 오디오 길이 체크 (0.5초 이상)
    const totalLength = audioBufferRef.current.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const minBytes = sampleRate * 2 * 0.5;
    if (totalLength < minBytes) {
      return;
    }

    isSendingRef.current = true;

    const audioChunks = [...audioBufferRef.current];
    audioBufferRef.current = [];

    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([combined], { type: 'audio/pcm' });
      formData.append('audio', audioBlob);
      formData.append('token', tokenRef.current);
      formData.append('sampleRate', sampleRate.toString());
      formData.append('encoding', encoding);
      formData.append('domain', domain);

      const response = await fetch('/api/rtzr/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.text && result.text.trim()) {
          onTranscript?.(result.text, true);
          setCurrentTranscript('');
        }
      } else {
        const error = await response.json();
        console.error('Transcribe API error:', error);
        if (error.details) {
          onError?.(new Error(error.details));
        }
      }
    } catch (error) {
      console.error('Failed to send audio:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to send audio'));
    } finally {
      isSendingRef.current = false;
    }
  }, [sampleRate, encoding, domain, onTranscript, onError]);

  const connect = useCallback((token: string) => {
    cleanup();
    setIsConnecting(true);
    tokenRef.current = token;

    if (realtime) {
      // 실시간 모드: SSE 연결
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionIdRef.current = sessionId;

      const sseUrl = `/api/rtzr/stream?token=${encodeURIComponent(token)}&sessionId=${sessionId}&sampleRate=${sampleRate}&encoding=${encoding}&domain=${domain}`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE 연결 열림');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            console.log('RTZR WebSocket 연결됨 (실시간 모드)');
            setIsConnected(true);
            setIsConnecting(false);

            // 주기적으로 오디오 전송
            sendIntervalRef.current = setInterval(sendAudioRealtime, sendInterval);
          } else if (data.type === 'transcript') {
            if (data.isFinal) {
              // 최종 결과: 보정된 텍스트 + RTZR 타임스탬프 정보 전달
              onTranscript?.(data.text, true, data.speaker, data.seq, data.startAt, data.duration);
              setCurrentTranscript('');
            } else {
              // 중간 결과: 실시간 업데이트 (UI 표시용)
              setCurrentTranscript(data.text);
            }
          } else if (data.type === 'error') {
            onError?.(new Error(data.message));
          } else if (data.type === 'closed') {
            cleanup();
          }
        } catch (error) {
          console.error('SSE message parse error:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        onError?.(new Error('SSE connection error'));
        cleanup();
      };
    } else {
      // HTTP 배치 모드
      console.log('RTZR 연결됨 (HTTP 배치 모드)');
      setIsConnected(true);
      setIsConnecting(false);
      sendIntervalRef.current = setInterval(sendBufferedAudioBatch, 5000);
    }
  }, [cleanup, realtime, sampleRate, encoding, domain, sendInterval, sendAudioRealtime, sendBufferedAudioBatch, onTranscript, onError]);

  const disconnect = useCallback(() => {
    if (realtime && sessionIdRef.current) {
      // EOS 전송
      fetch(`/api/rtzr/stream?sessionId=${sessionIdRef.current}&eos=true`, {
        method: 'POST',
      }).catch(console.error);
    } else {
      sendBufferedAudioBatch();
    }
    cleanup();
  }, [realtime, cleanup, sendBufferedAudioBatch]);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (!tokenRef.current && !sessionIdRef.current) return;
    audioBufferRef.current.push(audioData);
  }, []);

  const sendEOS = useCallback(() => {
    if (realtime && sessionIdRef.current) {
      fetch(`/api/rtzr/stream?sessionId=${sessionIdRef.current}&eos=true`, {
        method: 'POST',
      }).catch(console.error);
    } else {
      sendBufferedAudioBatch();
    }
  }, [realtime, sendBufferedAudioBatch]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isConnecting,
    currentTranscript,
    connect,
    disconnect,
    sendAudio,
    sendEOS,
  };
}
