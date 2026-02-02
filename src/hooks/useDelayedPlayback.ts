'use client';

/**
 * 지연 송출 모드 훅 v2
 *
 * 원리:
 * 1. 영상 로드 시 바로 재생하지 않고 버퍼링 시작
 * 2. 영상을 muted로 재생하면서 오디오 캡처 → STT → 보정
 * 3. 15초 후 영상을 처음으로 되감고 소리와 함께 재생
 * 4. 버퍼된 자막이 영상과 동기화되어 표시
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRtzrStream } from './useRtzrStream';
import { AudioCapture } from '@/lib/audio/capture';
import type { Subtitle } from '@/types';

const DEFAULT_DELAY_MS = 15000;

interface BufferedSubtitle extends Subtitle {
  processedAt: number;
}

interface UseDelayedPlaybackOptions {
  videoUrl: string;
  midx: number | null;
  title?: string;
  delayMs?: number;
  enableOpenAI?: boolean;
}

interface UseDelayedPlaybackReturn {
  isBuffering: boolean;
  isPlaying: boolean;
  bufferProgress: number;
  bufferedSubtitles: Subtitle[];
  displaySubtitles: Subtitle[];
  currentTranscript: string;
  error: string | null;
  startDelayedPlayback: (videoElement: HTMLVideoElement) => Promise<void>;
  stopPlayback: () => void;
}

// 중복 제거 함수
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

// 유사도 체크
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

// OpenAI 보정
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

// 세션 생성
async function getOrCreateSession(
  kmsUrl: string,
  midx: number,
  title?: string
): Promise<{ session: { id: string } } | null> {
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

// DB 저장
async function saveSubtitleToDb(subtitle: Subtitle, seq: number): Promise<void> {
  try {
    await fetch('/api/subtitles', {
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
  } catch {
    // ignore
  }
}

export function useDelayedPlayback({
  videoUrl,
  midx,
  title,
  delayMs = DEFAULT_DELAY_MS,
  enableOpenAI = true,
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
  const bufferCompleteRef = useRef<boolean>(false);

  // 자막 처리
  const handleTranscript = useCallback(
    async (text: string, isFinal: boolean, speaker?: number | null, _rtzrSeq?: number, startAt?: number, duration?: number) => {
      if (!isFinal || !text.trim()) return;

      const cleanedText = removeDuplicates(text.trim());
      if (!cleanedText) return;

      if (isSimilarToPrevious(cleanedText, lastTextRef.current)) {
        return;
      }
      lastTextRef.current = cleanedText;

      // 타임스탬프
      let startTimeMs = startAt ?? 0;
      let endTimeMs = (startAt ?? 0) + (duration ?? 3000);

      // OpenAI 보정 (버퍼링 중에만)
      let finalText = cleanedText;
      if (enableOpenAI && !bufferCompleteRef.current) {
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
        confidence: 0.95,
        speaker: speaker ?? null,
        isFinal: true,
        processedAt: Date.now(),
      };

      console.log('[DelayedPlayback] Subtitle:', finalText.slice(0, 40));

      setBufferedSubtitles(prev => [...prev, newSubtitle]);

      // 재생 중이면 표시 자막에도 추가
      if (bufferCompleteRef.current) {
        setDisplaySubtitles(prev => [...prev, newSubtitle]);
      }

      // DB 저장
      if (sessionIdRef.current) {
        saveSubtitleToDb(newSubtitle, seq);
      }
    },
    [enableOpenAI]
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

  // 버퍼링 타이머
  useEffect(() => {
    if (!isBuffering) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - bufferStartTimeRef.current;
      const progress = Math.min(100, (elapsed / delayMs) * 100);
      setBufferProgress(progress);

      // 버퍼링 완료
      if (elapsed >= delayMs && videoElementRef.current && !bufferCompleteRef.current) {
        console.log('[DelayedPlayback] Buffer complete!');
        bufferCompleteRef.current = true;

        const video = videoElementRef.current;

        // 1. 오디오 캡처 중지 (새로운 세션으로 다시 시작해야 함)
        if (audioCaptureRef.current) {
          audioCaptureRef.current.stop();
          audioCaptureRef.current = null;
        }

        // 2. 영상 처음으로 되감기, 볼륨 복원
        video.pause();
        video.currentTime = 0;
        video.volume = 1; // 볼륨 복원

        // 3. 버퍼된 자막을 표시 자막으로 복사
        setDisplaySubtitles([...bufferedSubtitles]);

        // 4. 상태 업데이트
        setIsBuffering(false);
        setIsPlaying(true);

        // 5. 재생 시작
        video.play().catch(console.error);

        // 6. 새로운 오디오 캡처 시작 (재생 중인 영상에서)
        const newAudioCapture = new AudioCapture({
          sampleRate: 16000,
          onAudioData: (pcmData) => {
            sendAudio(pcmData);
          },
        });
        newAudioCapture.startFromVideo(video).then(() => {
          audioCaptureRef.current = newAudioCapture;
          console.log('[DelayedPlayback] Playback started with audio capture');
        });

        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isBuffering, delayMs, bufferedSubtitles, sendAudio]);

  // 지연 재생 시작
  const startDelayedPlayback = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        setError(null);
        setBufferedSubtitles([]);
        setDisplaySubtitles([]);
        bufferCompleteRef.current = false;
        videoElementRef.current = videoElement;
        subtitleSeqRef.current = 0;
        lastTextRef.current = '';
        lastContextRef.current = '';

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

        // RTZR 토큰
        const tokenResponse = await fetch('/api/auth/rtzr', { method: 'POST' });
        if (!tokenResponse.ok) {
          throw new Error('RTZR 인증 실패');
        }
        const { token } = await tokenResponse.json();

        // RTZR 연결
        connect(token);

        // 영상 설정: volume=0으로 재생 (muted는 Web Audio API 캡처를 차단함)
        videoElement.currentTime = 0;
        videoElement.volume = 0; // muted 대신 volume=0 사용
        videoElement.muted = false;
        await videoElement.play();

        // 오디오 캡처 시작
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

        console.log('[DelayedPlayback] Buffering started, video playing muted');
      } catch (err) {
        setError(err instanceof Error ? err.message : '지연 재생 시작 실패');
        setIsBuffering(false);
      }
    },
    [connect, sendAudio, delayMs, midx, videoUrl, title]
  );

  // 중지
  const stopPlayback = useCallback(() => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }

    sendEOS();
    disconnect();

    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.volume = 1;
    }

    bufferCompleteRef.current = false;
    setIsBuffering(false);
    setIsPlaying(false);
    setBufferProgress(0);
  }, [disconnect, sendEOS]);

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
  };
}
