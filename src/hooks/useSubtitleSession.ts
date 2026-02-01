'use client';

// @TASK T1.4 - 자막 DB 저장 연동
// @SPEC docs/planning/06-tasks.md#T1.4

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRtzrStream } from './useRtzrStream';
import { AudioCapture } from '@/lib/audio/capture';
import type { Subtitle, VideoSession } from '@/types';

interface UseSubtitleSessionOptions {
  videoUrl: string;
  midx: number | null;
  title?: string;
  onSubtitleUpdate?: (subtitles: Subtitle[]) => void;
}

interface UseSubtitleSessionReturn {
  isActive: boolean;
  isConnecting: boolean;
  subtitles: Subtitle[];
  currentTranscript: string;
  error: string | null;
  dbSessionId: string | null;
  startSession: (videoElement: HTMLVideoElement) => Promise<void>;
  stopSession: () => void;
  loadExistingSubtitles: () => Promise<void>;
}


// @TASK T1.4.1 - 자막 저장 헬퍼 함수
async function saveSubtitleToDb(subtitle: Subtitle, seq: number): Promise<boolean> {
  try {
    const response = await fetch('/api/subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: subtitle.sessionId,
        startTimeMs: subtitle.startTimeMs,
        endTimeMs: subtitle.endTimeMs,
        text: subtitle.text,
        confidence: subtitle.confidence,
        seq,
      }),
    });

    if (!response.ok) {
      console.error('[T1.4] Failed to save subtitle:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('[T1.4] Error saving subtitle:', err);
    return false;
  }
}

// @TASK T1.4.2 - 세션 생성/조회 헬퍼 함수
async function getOrCreateSession(
  kmsUrl: string,
  midx: number,
  title?: string
): Promise<{ session: VideoSession; isExisting: boolean } | null> {
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kmsUrl,
        midx,
        title,
        isLive: true,
      }),
    });

    if (!response.ok) {
      console.error('[T1.4] Failed to create/get session:', await response.text());
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('[T1.4] Error creating session:', err);
    return null;
  }
}

// @TASK T1.4.3 - 기존 자막 불러오기 헬퍼 함수
async function fetchExistingSubtitles(sessionId: string): Promise<Subtitle[]> {
  try {
    const response = await fetch(`/api/subtitles?sessionId=${sessionId}`);

    if (!response.ok) {
      console.error('[T1.4] Failed to fetch subtitles:', await response.text());
      return [];
    }

    const data = await response.json();
    // DB 응답을 Subtitle 타입으로 변환
    return (data.subtitles || []).map((s: Subtitle) => ({
      ...s,
      isFinal: true,
    }));
  } catch (err) {
    console.error('[T1.4] Error fetching subtitles:', err);
    return [];
  }
}

export function useSubtitleSession({
  videoUrl,
  midx,
  title,
  onSubtitleUpdate,
}: UseSubtitleSessionOptions): UseSubtitleSessionReturn {
  const [isActive, setIsActive] = useState(false);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const subtitleSeqRef = useRef<number>(0);

  // 자막 시작 시간 및 화자 추적용 ref
  const sentenceStartTimeRef = useRef<number>(0);
  const currentSpeakerRef = useRef<number | null>(null);

  const handleTranscript = useCallback(
    (text: string, isFinal: boolean, speaker?: number | null) => {
      // isFinal이 true면 바로 자막으로 추가 (RTZR이 이미 적절한 단위로 보내줌)
      if (!isFinal || !text.trim()) return;

      const currentTimeMs = videoElementRef.current
        ? Math.floor(videoElementRef.current.currentTime * 1000)
        : 0;

      // 화자 업데이트
      if (speaker !== undefined && speaker !== null) {
        currentSpeakerRef.current = speaker;
      }

      // 시작 시간이 없으면 현재 시간 기록
      if (sentenceStartTimeRef.current === 0) {
        sentenceStartTimeRef.current = Math.max(0, currentTimeMs - 3000); // 3초 전으로 추정
      }

      // 바로 자막으로 추가
      const seq = subtitleSeqRef.current++;
      const newSubtitle: Subtitle = {
        id: crypto.randomUUID(),
        sessionId: sessionIdRef.current || '',
        startTimeMs: sentenceStartTimeRef.current,
        endTimeMs: currentTimeMs,
        text: text.trim(),
        confidence: 0.9,
        speaker: currentSpeakerRef.current,
        isFinal: true,
        seq,
      };

      setSubtitles((prev) => {
        const updated = [...prev, newSubtitle];
        onSubtitleUpdate?.(updated);
        return updated;
      });

      // DB에 저장
      if (sessionIdRef.current) {
        saveSubtitleToDb(newSubtitle, seq).then((success) => {
          if (success) {
            console.log('[T1.4] Subtitle saved:', newSubtitle.text.slice(0, 30));
          }
        });
      }

      // 다음 자막을 위해 시작 시간 리셋
      sentenceStartTimeRef.current = currentTimeMs;
    },
    [onSubtitleUpdate]
  );

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const {
    isConnecting,
    currentTranscript,
    connect,
    disconnect,
    sendAudio,
    sendEOS,
  } = useRtzrStream({
    realtime: true, // 실시간 SSE 모드 활성화
    sendInterval: 100, // 100ms마다 오디오 전송 (실시간)
    onTranscript: handleTranscript,
    onError: handleError,
  });

  // @TASK T1.4.6 - 세션 시작 시 DB에 세션 생성
  const startSession = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        setError(null);
        videoElementRef.current = videoElement;

        // DB에 세션 생성/조회 (midx가 있는 경우)
        if (midx !== null) {
          const sessionResult = await getOrCreateSession(videoUrl, midx, title);

          if (sessionResult) {
            sessionIdRef.current = sessionResult.session.id;
            setDbSessionId(sessionResult.session.id);

            // 기존 세션인 경우 자막 불러오기
            if (sessionResult.isExisting) {
              console.log('[T1.4] Existing session found, loading subtitles...');
              const existingSubtitles = await fetchExistingSubtitles(sessionResult.session.id);
              if (existingSubtitles.length > 0) {
                setSubtitles(existingSubtitles);
                subtitleSeqRef.current = existingSubtitles.length;
                onSubtitleUpdate?.(existingSubtitles);
                console.log(`[T1.4] Loaded ${existingSubtitles.length} existing subtitles`);
              }
            }
          } else {
            // DB 세션 생성 실패 시 로컬 세션 ID 사용
            console.warn('[T1.4] Failed to create DB session, using local session ID');
            sessionIdRef.current = crypto.randomUUID();
          }
        } else {
          // midx가 없으면 로컬 세션 ID만 사용
          sessionIdRef.current = crypto.randomUUID();
        }

        sentenceStartTimeRef.current = Math.floor(videoElement.currentTime * 1000);
        currentSpeakerRef.current = null;

        // RTZR 토큰 요청
        const tokenResponse = await fetch('/api/auth/rtzr', { method: 'POST' });
        if (!tokenResponse.ok) {
          throw new Error('RTZR 인증 실패');
        }
        const { token } = await tokenResponse.json();

        // 연결 시작
        connect(token);

        // 비디오 오디오 캡처 시작
        const audioCapture = new AudioCapture({
          sampleRate: 16000,
          onAudioData: (pcmData) => {
            sendAudio(pcmData);
          },
        });

        await audioCapture.startFromVideo(videoElement);
        audioCaptureRef.current = audioCapture;

        setIsActive(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '세션 시작 실패');
      }
    },
    [connect, sendAudio, midx, videoUrl, title, onSubtitleUpdate]
  );

  const stopSession = useCallback(() => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }

    sendEOS();
    disconnect();
    setIsActive(false);
    videoElementRef.current = null;
    sentenceStartTimeRef.current = 0;
    currentSpeakerRef.current = null;
    console.log('[T1.4] Session stopped, all subtitles saved');
  }, [disconnect, sendEOS]);

  // @TASK T1.4.7 - 기존 세션의 자막 불러오기 (수동 호출용)
  const loadExistingSubtitles = useCallback(async () => {
    if (!dbSessionId) {
      console.warn('[T1.4] No session ID available to load subtitles');
      return;
    }

    try {
      const existingSubtitles = await fetchExistingSubtitles(dbSessionId);
      if (existingSubtitles.length > 0) {
        setSubtitles(existingSubtitles);
        subtitleSeqRef.current = existingSubtitles.length;
        onSubtitleUpdate?.(existingSubtitles);
        console.log(`[T1.4] Loaded ${existingSubtitles.length} subtitles from DB`);
      }
    } catch (err) {
      console.error('[T1.4] Error loading subtitles:', err);
    }
  }, [dbSessionId, onSubtitleUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop();
      }
    };
  }, []);

  // 현재 인식 중인 텍스트 (중간 결과)
  const displayTranscript = currentTranscript;

  return {
    isActive,
    isConnecting,
    subtitles,
    currentTranscript: displayTranscript,
    error,
    dbSessionId,
    startSession,
    stopSession,
    loadExistingSubtitles,
  };
}
