'use client';

/**
 * 지연 송출 모드 훅
 *
 * 영상을 지연시켜 재생하고, 그 동안 자막을 완전히 보정한 후 표시합니다.
 * - 오디오 캡처 → STT → 중복 제거 → OpenAI 보정 → 버퍼 저장
 * - 지연 시간 후 영상 재생 시작
 * - 버퍼된 자막과 영상 동기화
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRtzrStream } from './useRtzrStream';
import { AudioCapture } from '@/lib/audio/capture';
import type { Subtitle } from '@/types';

// 기본 지연 시간 (15초)
const DEFAULT_DELAY_MS = 15000;

interface BufferedSubtitle extends Subtitle {
  processedAt: number; // 처리 완료 시간
  corrected: boolean;  // OpenAI 보정 완료 여부
}

interface UseDelayedPlaybackOptions {
  videoUrl: string;
  midx: number | null;
  title?: string;
  delayMs?: number;
  enableOpenAI?: boolean;
  onSubtitleReady?: (subtitle: Subtitle) => void;
}

interface UseDelayedPlaybackReturn {
  isBuffering: boolean;
  isPlaying: boolean;
  bufferProgress: number; // 0-100
  bufferedSubtitles: Subtitle[];
  displaySubtitles: Subtitle[]; // 현재 표시 가능한 자막
  currentTranscript: string;
  error: string | null;
  startDelayedPlayback: (videoElement: HTMLVideoElement) => Promise<void>;
  stopPlayback: () => void;
  getSubtitleAtTime: (timeMs: number) => Subtitle | null;
}

// 중복 단어/음절 제거 함수
function removeDuplicates(text: string): string {
  let result = text;
  result = result.replace(/(\S+)\s+\1(?=\s|$)/g, '$1');
  result = result.replace(/(.{2,})\1+/g, '$1');
  result = result.replace(/(\S{2,})\s+\1의?$/g, '$1');
  result = result.replace(/다\s+(니다|입니다)$/g, '다');
  result = result.replace(/(께|을|를|이|가|은|는|도|만)\1+/g, '$1');
  result = result.replace(/(.)\1{2,}/g, '$1$1');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

// 이전 자막과 유사도 체크
function isSimilarToPrevious(newText: string, prevText: string): boolean {
  if (!prevText) return false;
  if (newText === prevText) return true;
  if (prevText.includes(newText)) return true;
  const minLen = Math.min(newText.length, prevText.length);
  const compareLen = Math.floor(minLen * 0.8);
  if (compareLen > 5 && newText.slice(0, compareLen) === prevText.slice(0, compareLen)) {
    return true;
  }
  return false;
}

// OpenAI 자막 보정
async function correctWithOpenAI(text: string, context?: string): Promise<string> {
  try {
    const response = await fetch('/api/openai/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context }),
    });

    if (!response.ok) return text;

    const data = await response.json();
    return data.skipped ? text : data.corrected;
  } catch {
    return text;
  }
}

// DB에 자막 저장
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
    return response.ok;
  } catch {
    return false;
  }
}

// 세션 생성/조회
async function getOrCreateSession(
  kmsUrl: string,
  midx: number,
  title?: string
): Promise<{ session: { id: string }; isExisting: boolean; subtitleCount: number } | null> {
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kmsUrl, midx, title, isLive: true }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function useDelayedPlayback({
  videoUrl,
  midx,
  title,
  delayMs = DEFAULT_DELAY_MS,
  enableOpenAI = true,
  onSubtitleReady,
}: UseDelayedPlaybackOptions): UseDelayedPlaybackReturn {
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [bufferedSubtitles, setBufferedSubtitles] = useState<BufferedSubtitle[]>([]);
  const [displaySubtitles, setDisplaySubtitles] = useState<Subtitle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const subtitleSeqRef = useRef<number>(0);
  const bufferStartTimeRef = useRef<number>(0);
  const lastTextRef = useRef<string>('');
  const lastContextRef = useRef<string>('');
  const playbackStartTimeRef = useRef<number>(0);

  // 버퍼링 진행률 업데이트
  useEffect(() => {
    if (!isBuffering) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - bufferStartTimeRef.current;
      const progress = Math.min(100, (elapsed / delayMs) * 100);
      setBufferProgress(progress);

      // 지연 시간 완료 시 재생 시작
      if (elapsed >= delayMs && videoElementRef.current) {
        console.log('[DelayedPlayback] Buffer complete, starting playback');
        setIsBuffering(false);
        setIsPlaying(true);
        playbackStartTimeRef.current = Date.now();
        videoElementRef.current.play();

        // 버퍼된 자막을 표시 자막으로 이동
        setDisplaySubtitles(bufferedSubtitles.map(s => ({
          id: s.id,
          sessionId: s.sessionId,
          startTimeMs: s.startTimeMs,
          endTimeMs: s.endTimeMs,
          text: s.text,
          confidence: s.confidence,
          speaker: s.speaker,
          isFinal: true,
        })));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isBuffering, delayMs, bufferedSubtitles]);

  // 자막 처리 핸들러
  const handleTranscript = useCallback(
    async (text: string, isFinal: boolean, speaker?: number | null, rtzrSeq?: number, startAt?: number, duration?: number) => {
      if (!isFinal || !text.trim()) return;

      // 1단계: 중복 제거
      const cleanedText = removeDuplicates(text.trim());
      if (!cleanedText) return;

      // 유사도 체크
      if (isSimilarToPrevious(cleanedText, lastTextRef.current)) {
        console.log('[DelayedPlayback] Similar text ignored:', cleanedText.slice(0, 20));
        return;
      }
      lastTextRef.current = cleanedText;

      // 타임스탬프 계산
      let startTimeMs: number;
      let endTimeMs: number;

      if (startAt !== undefined && duration !== undefined) {
        startTimeMs = startAt;
        endTimeMs = startAt + duration;
      } else {
        const currentTimeMs = videoElementRef.current
          ? Math.floor(videoElementRef.current.currentTime * 1000)
          : 0;
        startTimeMs = Math.max(0, currentTimeMs - 3000);
        endTimeMs = currentTimeMs;
      }

      // 2단계: OpenAI 보정 (지연 시간 동안 여유 있게 처리)
      let finalText = cleanedText;
      if (enableOpenAI) {
        console.log('[DelayedPlayback] Applying OpenAI correction...');
        finalText = await correctWithOpenAI(cleanedText, lastContextRef.current);
        lastContextRef.current = finalText;
      }

      const seq = subtitleSeqRef.current++;
      const newSubtitle: BufferedSubtitle = {
        id: crypto.randomUUID(),
        sessionId: sessionIdRef.current || '',
        startTimeMs,
        endTimeMs,
        text: finalText,
        confidence: 0.95, // 보정 후 신뢰도 상향
        speaker: speaker ?? null,
        isFinal: true,
        processedAt: Date.now(),
        corrected: enableOpenAI,
      };

      console.log('[DelayedPlayback] Buffered subtitle:', finalText.slice(0, 30));

      // 버퍼에 추가
      setBufferedSubtitles(prev => [...prev, newSubtitle]);

      // 이미 재생 중이면 바로 표시 자막에도 추가
      if (isPlaying) {
        setDisplaySubtitles(prev => [...prev, {
          id: newSubtitle.id,
          sessionId: newSubtitle.sessionId,
          startTimeMs: newSubtitle.startTimeMs,
          endTimeMs: newSubtitle.endTimeMs,
          text: newSubtitle.text,
          confidence: newSubtitle.confidence,
          speaker: newSubtitle.speaker,
          isFinal: true,
        }]);
        onSubtitleReady?.(newSubtitle);
      }

      // DB에 저장
      if (sessionIdRef.current) {
        saveSubtitleToDb(newSubtitle, seq);
      }
    },
    [enableOpenAI, isPlaying, onSubtitleReady]
  );

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const {
    currentTranscript,
    connect,
    disconnect,
    sendAudio,
    sendEOS,
  } = useRtzrStream({
    realtime: true,
    sendInterval: 500,
    onTranscript: handleTranscript,
    onError: handleError,
  });

  // 지연 재생 시작
  const startDelayedPlayback = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        setError(null);
        setBufferedSubtitles([]);
        setDisplaySubtitles([]);
        videoElementRef.current = videoElement;

        // 영상 일시정지
        videoElement.pause();
        videoElement.currentTime = 0;

        console.log(`[DelayedPlayback] Starting with ${delayMs}ms delay`);

        // 세션 생성
        if (midx !== null) {
          const sessionResult = await getOrCreateSession(videoUrl, midx, title);
          if (sessionResult) {
            sessionIdRef.current = sessionResult.session.id;
          }
        }
        if (!sessionIdRef.current) {
          sessionIdRef.current = crypto.randomUUID();
        }

        // RTZR 토큰 요청
        const tokenResponse = await fetch('/api/auth/rtzr', { method: 'POST' });
        if (!tokenResponse.ok) {
          throw new Error('RTZR 인증 실패');
        }
        const { token } = await tokenResponse.json();

        // 연결 시작
        connect(token);

        // 오디오 캡처 시작 (영상은 정지 상태지만 오디오는 캡처)
        // 참고: 영상이 정지 상태면 오디오도 안 나오므로, 영상을 muted로 재생
        videoElement.muted = true;
        videoElement.play();

        const audioCapture = new AudioCapture({
          sampleRate: 16000,
          onAudioData: (pcmData) => {
            sendAudio(pcmData);
          },
        });

        await audioCapture.startFromVideo(videoElement);
        audioCaptureRef.current = audioCapture;

        // 버퍼링 시작
        setIsBuffering(true);
        bufferStartTimeRef.current = Date.now();
        setBufferProgress(0);

        // 지연 후 영상 unmute 및 재생 위치 조정
        setTimeout(() => {
          if (videoElementRef.current) {
            // 영상 처음으로 되감고 unmute 후 재생
            videoElementRef.current.pause();
            videoElementRef.current.currentTime = 0;
            videoElementRef.current.muted = false;
          }
        }, delayMs);

        console.log('[DelayedPlayback] Buffering started');
      } catch (err) {
        setError(err instanceof Error ? err.message : '지연 재생 시작 실패');
        setIsBuffering(false);
      }
    },
    [connect, sendAudio, delayMs, midx, videoUrl, title]
  );

  // 재생 중지
  const stopPlayback = useCallback(() => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }

    sendEOS();
    disconnect();

    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.muted = false;
    }

    setIsBuffering(false);
    setIsPlaying(false);
    setBufferProgress(0);
    console.log('[DelayedPlayback] Playback stopped');
  }, [disconnect, sendEOS]);

  // 특정 시간의 자막 가져오기
  const getSubtitleAtTime = useCallback((timeMs: number): Subtitle | null => {
    return displaySubtitles.find(
      s => timeMs >= s.startTimeMs && timeMs < s.endTimeMs
    ) || null;
  }, [displaySubtitles]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop();
      }
    };
  }, []);

  return {
    isBuffering,
    isPlaying,
    bufferProgress,
    bufferedSubtitles,
    displaySubtitles,
    currentTranscript,
    error,
    startDelayedPlayback,
    stopPlayback,
    getSubtitleAtTime,
  };
}
