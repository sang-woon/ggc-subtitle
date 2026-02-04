'use client';

// @TASK T1.4 - 자막 DB 저장 연동
// @SPEC docs/planning/06-tasks.md#T1.4

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRtzrStream } from './useRtzrStream';
import { AudioCapture } from '@/lib/audio/capture';
import { generateUUID } from '@/lib/utils';
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
  hasExistingSubtitles: boolean;
  existingSubtitleCount: number;
  startSession: (videoElement: HTMLVideoElement, midxParam?: number | null, videoUrlParam?: string) => Promise<void>;
  stopSession: () => void;
  loadExistingSubtitles: () => Promise<void>;
  checkExistingSubtitles: (midxParam?: number | null, videoUrlParam?: string) => Promise<{ hasSubtitles: boolean; count: number }>;
  startRealtimeSession: (videoElement: HTMLVideoElement) => Promise<void>;
}


// 문자열 해시코드 생성 (생중계 URL → synthetic midx 변환용)
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % 1000000 + 900000; // 900000~1900000 범위의 음수 midx로 사용
}

// 중복 단어/음절 제거 함수
function removeDuplicates(text: string): string {
  let result = text;

  // 1. 연속된 같은 단어 제거 (예: "의결 의결" → "의결")
  result = result.replace(/(\S+)\s+\1(?=\s|$)/g, '$1');

  // 2. 연속된 같은 2글자 이상 음절 제거 (예: "심사심사" → "심사")
  result = result.replace(/(.{2,})\1+/g, '$1');

  // 3. 끝부분 중복 제거 (예: "하겠습니다 니다" → "하겠습니다")
  result = result.replace(/(\S{2,})\s+\1의?$/g, '$1');
  result = result.replace(/다\s+(니다|입니다)$/g, '다');

  // 4. 조사 중복 제거 (예: "께께도" → "께도", "을을" → "을")
  result = result.replace(/(께|을|를|이|가|은|는|도|만)\1+/g, '$1');

  // 5. 연속된 같은 글자 3개 이상 제거 (예: "으으으" → "으")
  result = result.replace(/(.)\1{2,}/g, '$1$1');

  // 6. 공백 정리
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// 이전 자막과의 유사도 체크 (중복 방지)
function isSimilarToPrevious(newText: string, prevText: string): boolean {
  if (!prevText) return false;

  // 정확히 같으면 중복
  if (newText === prevText) return true;

  // 새 텍스트가 이전 텍스트의 일부이면 중복
  if (prevText.includes(newText)) return true;

  // 이전 텍스트가 새 텍스트의 일부이고, 길이 차이가 적으면 업데이트로 간주
  if (newText.includes(prevText) && newText.length - prevText.length < 10) {
    return false; // 업데이트 허용
  }

  // 앞부분이 80% 이상 같으면 중복으로 간주
  const minLen = Math.min(newText.length, prevText.length);
  const compareLen = Math.floor(minLen * 0.8);
  if (compareLen > 5 && newText.slice(0, compareLen) === prevText.slice(0, compareLen)) {
    return true;
  }

  return false;
}

// OpenAI 자막 보정 헬퍼 함수
async function correctTextWithOpenAI(text: string, context?: string): Promise<string> {
  try {
    const response = await fetch('/api/openai/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context }),
    });

    if (!response.ok) {
      console.warn('[OpenAI] Correction failed, using original text');
      return text;
    }

    const data = await response.json();
    if (data.skipped) {
      return text;
    }

    console.log('[OpenAI] Corrected:', text.slice(0, 20), '→', data.corrected.slice(0, 20));
    return data.corrected;
  } catch (err) {
    console.error('[OpenAI] Error:', err);
    return text;
  }
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
): Promise<{ session: VideoSession; isExisting: boolean; subtitleCount: number } | null> {
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
  const [hasExistingSubtitles, setHasExistingSubtitles] = useState(false);
  const [existingSubtitleCount, setExistingSubtitleCount] = useState(0);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const subtitleSeqRef = useRef<number>(0);

  // 자막 시작 시간 및 화자 추적용 ref
  const sentenceStartTimeRef = useRef<number>(0);
  const currentSpeakerRef = useRef<number | null>(null);

  // 오디오 캡처 시작 시점의 비디오 시간 (RTZR 타임스탬프 오프셋용)
  const videoStartTimeRef = useRef<number>(0);

  // 중복 방지용: RTZR seq 번호 및 마지막 텍스트 추적
  const lastRtzrSeqRef = useRef<number>(-1);
  const lastTextRef = useRef<string>('');

  // 이전 자막 컨텍스트 (OpenAI 보정에 사용)
  const lastContextRef = useRef<string>('');

  const handleTranscript = useCallback(
    async (text: string, isFinal: boolean, speaker?: number | null, rtzrSeq?: number, startAt?: number, duration?: number) => {
      // isFinal이 true면 바로 자막으로 추가 (RTZR이 이미 적절한 단위로 보내줌)
      if (!isFinal || !text.trim()) return;

      // 중복 체크 1: 같은 RTZR seq 번호는 무시
      if (rtzrSeq !== undefined && rtzrSeq <= lastRtzrSeqRef.current) {
        console.log('[T1.4] Duplicate seq ignored:', rtzrSeq);
        return;
      }
      if (rtzrSeq !== undefined) {
        lastRtzrSeqRef.current = rtzrSeq;
      }

      // 텍스트 전처리: 중복 단어/음절 제거
      const cleanedText = removeDuplicates(text.trim());
      if (!cleanedText) return;

      // 중복 체크 2: 이전 자막과 유사하면 무시
      if (isSimilarToPrevious(cleanedText, lastTextRef.current)) {
        console.log('[T1.4] Similar text ignored:', cleanedText.slice(0, 20));
        return;
      }
      lastTextRef.current = cleanedText;

      // 타임스탬프 계산: RTZR의 startAt/duration + 비디오 시작 오프셋
      let startTimeMs: number;
      let endTimeMs: number;

      if (startAt !== undefined && duration !== undefined) {
        // RTZR 시간 + 비디오 시작 시점 오프셋 (영상 절대 시간으로 변환)
        const videoOffset = videoStartTimeRef.current;
        startTimeMs = startAt + videoOffset;
        endTimeMs = startAt + duration + videoOffset;
      } else {
        // 폴백: 비디오 현재 시간 사용
        const currentTimeMs = videoElementRef.current
          ? Math.floor(videoElementRef.current.currentTime * 1000)
          : 0;

        // 시작 시간 추정
        if (sentenceStartTimeRef.current === 0) {
          sentenceStartTimeRef.current = Math.max(0, currentTimeMs - 3000);
        }
        startTimeMs = sentenceStartTimeRef.current;
        endTimeMs = currentTimeMs;
        sentenceStartTimeRef.current = currentTimeMs;
      }

      // 화자 업데이트
      if (speaker !== undefined && speaker !== null) {
        currentSpeakerRef.current = speaker;
      }

      // OpenAI로 자막 보정 (이전 문맥 전달) - 할당량 초과 시 원본 사용
      // TODO: OpenAI API 크레딧 충전 후 활성화
      // const correctedText = await correctTextWithOpenAI(cleanedText, lastContextRef.current);
      const correctedText = cleanedText; // 임시: OpenAI 비활성화, 중복 제거만 적용
      lastContextRef.current = correctedText; // 다음 보정을 위해 컨텍스트 저장

      // 보정된 자막으로 추가
      const seq = subtitleSeqRef.current++;
      const newSubtitle: Subtitle = {
        id: generateUUID(),
        sessionId: sessionIdRef.current || '',
        startTimeMs,
        endTimeMs,
        text: correctedText,
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
    realtime: false, // HTTP 배치 모드 (Vercel 서버리스에서 SSE 세션 유지 불가)
    sendInterval: 2000, // 2초마다 배치 전송 (더 자주 전송하여 실시간성 개선)
    onTranscript: handleTranscript,
    onError: handleError,
  });

  // 기존 자막 유무 확인 (영상 로드 시 호출)
  // midxParam을 전달하면 상태 대신 해당 값 사용 (비동기 상태 업데이트 문제 해결)
  const checkExistingSubtitles = useCallback(async (
    midxParam?: number | null,
    videoUrlParam?: string
  ): Promise<{ hasSubtitles: boolean; count: number }> => {
    // 파라미터가 전달되면 사용, 아니면 상태 사용
    const effectiveMidx = midxParam !== undefined ? midxParam : midx;
    const effectiveVideoUrl = videoUrlParam !== undefined ? videoUrlParam : videoUrl;

    if (effectiveMidx === null) {
      console.log('[T1.4] checkExistingSubtitles: midx is null, skipping');
      return { hasSubtitles: false, count: 0 };
    }

    console.log(`[T1.4] checkExistingSubtitles: midx=${effectiveMidx}, videoUrl=${effectiveVideoUrl?.slice(0, 50)}`);

    try {
      const sessionResult = await getOrCreateSession(effectiveVideoUrl, effectiveMidx, title);

      if (sessionResult) {
        sessionIdRef.current = sessionResult.session.id;
        setDbSessionId(sessionResult.session.id);

        const subtitleCount = sessionResult.subtitleCount || 0;
        const hasSubtitles = sessionResult.isExisting && subtitleCount > 0;

        console.log(`[T1.4] Session result: isExisting=${sessionResult.isExisting}, subtitleCount=${subtitleCount}`);

        setHasExistingSubtitles(hasSubtitles);
        setExistingSubtitleCount(subtitleCount);

        // 기존 자막이 있으면 바로 로드
        if (hasSubtitles) {
          console.log(`[T1.4] Found ${subtitleCount} existing subtitles, loading...`);
          const existingSubtitles = await fetchExistingSubtitles(sessionResult.session.id);
          if (existingSubtitles.length > 0) {
            setSubtitles(existingSubtitles);
            subtitleSeqRef.current = existingSubtitles.length;
            onSubtitleUpdate?.(existingSubtitles);
            console.log(`[T1.4] Loaded ${existingSubtitles.length} subtitles`);
          }
        }

        return { hasSubtitles, count: subtitleCount };
      }

      return { hasSubtitles: false, count: 0 };
    } catch (err) {
      console.error('[T1.4] Error checking existing subtitles:', err);
      return { hasSubtitles: false, count: 0 };
    }
  }, [midx, videoUrl, title, onSubtitleUpdate]);

  // 실시간 STT 시작 헬퍼 함수 (내부 사용)
  const doStartRealtimeSTT = async (videoElement: HTMLVideoElement) => {
    // DB에 세션 생성/조회
    if (!sessionIdRef.current) {
      // 생중계의 경우 URL에서 synthetic midx 생성 (음수 사용)
      const effectiveMidx = midx !== null ? midx : -Math.abs(hashCode(videoUrl));
      const sessionResult = await getOrCreateSession(videoUrl, effectiveMidx, title || '생중계');

      if (sessionResult) {
        sessionIdRef.current = sessionResult.session.id;
        setDbSessionId(sessionResult.session.id);
        console.log('[T1.4] Session created/found:', sessionResult.session.id);
      } else {
        console.warn('[T1.4] Failed to create DB session, subtitles will not be saved');
        // 세션 생성 실패 시에도 로컬에서는 동작하도록 UUID 사용
        sessionIdRef.current = generateUUID();
      }
    }

    // 비디오 시작 시점 저장 (RTZR 타임스탬프 오프셋용)
    videoStartTimeRef.current = Math.floor(videoElement.currentTime * 1000);
    sentenceStartTimeRef.current = videoStartTimeRef.current;
    currentSpeakerRef.current = null;
    console.log('[T1.4] Video start time offset:', videoStartTimeRef.current, 'ms');

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

    try {
      await audioCapture.startFromVideo(videoElement);
      audioCaptureRef.current = audioCapture;
      setIsActive(true);
      console.log('[T1.4] Realtime STT session started');
    } catch (captureError) {
      // 오디오 캡처 실패 (CORS 등) - 비디오는 계속 재생되도록 함
      console.error('[T1.4] Audio capture failed, video will continue playing:', captureError);
      setError('오디오 캡처 실패 - CORS 정책으로 인해 자막 생성 불가');
      // RTZR 연결 해제
      disconnect();
    }
  };

  // @TASK T1.4.6 - 세션 시작 (기존 자막이 있으면 STT 건너뛰기)
  // midxParam, videoUrlParam을 전달하면 상태 대신 해당 값 사용
  const startSession = useCallback(
    async (videoElement: HTMLVideoElement, midxParam?: number | null, videoUrlParam?: string) => {
      try {
        setError(null);
        videoElementRef.current = videoElement;

        // 기존 자막 확인 (파라미터가 있으면 전달)
        const { hasSubtitles, count } = await checkExistingSubtitles(midxParam, videoUrlParam);

        // 기존 자막이 있으면 STT 시작 안 함
        if (hasSubtitles) {
          console.log(`[T1.4] Using ${count} existing subtitles, skipping realtime STT`);
          return;
        }

        // 기존 자막이 없으면 실시간 STT 시작
        await doStartRealtimeSTT(videoElement);
      } catch (err) {
        setError(err instanceof Error ? err.message : '세션 시작 실패');
      }
    },
    [checkExistingSubtitles, connect, sendAudio, midx, videoUrl, title]
  );

  // 실시간 STT 세션 시작 (강제 시작용 - 기존 자막이 있어도 STT 실행)
  const startRealtimeSession = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        setError(null);
        videoElementRef.current = videoElement;
        await doStartRealtimeSTT(videoElement);
      } catch (err) {
        setError(err instanceof Error ? err.message : '실시간 자막 시작 실패');
      }
    },
    [connect, sendAudio, midx, videoUrl, title]
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
    hasExistingSubtitles,
    existingSubtitleCount,
    startSession,
    stopSession,
    loadExistingSubtitles,
    checkExistingSubtitles,
    startRealtimeSession,
  };
}
