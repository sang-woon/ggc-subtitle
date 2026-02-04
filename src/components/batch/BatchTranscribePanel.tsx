'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBatchTranscribe, BatchStatus, BatchSubtitle } from '@/hooks/useBatchTranscribe';
import { cn } from '@/lib/utils';
import { requestNotificationPermission, notifyTranscriptionComplete, notifyTranscriptionFailed } from '@/lib/notification';
import { getCachedTranscription, setCachedTranscription } from '@/lib/cache/transcriptionCache';

interface BatchTranscribePanelProps {
  videoUrl: string;
  onComplete?: (subtitles: BatchSubtitle[]) => void;
  onSubtitleClick?: (subtitle: BatchSubtitle) => void;
  className?: string;
}

/**
 * MP4 감지 유틸리티
 */
export function isMp4Video(url: string): boolean {
  if (!url) return false;
  return url.includes('.mp4') || url.includes('vodViewer');
}

/**
 * 예상 처리 시간 계산 (영상 길이 기반)
 * 대략 실시간의 25~50% 시간 소요
 */
function estimateProcessingTime(durationMs?: number): string {
  if (!durationMs) return '알 수 없음';

  const durationMin = durationMs / 60000;
  const minTime = Math.ceil(durationMin * 0.25);
  const maxTime = Math.ceil(durationMin * 0.5);

  if (maxTime < 1) return '1분 이내';
  if (maxTime < 60) return `${minTime}~${maxTime}분`;

  const minHours = Math.floor(minTime / 60);
  const maxHours = Math.ceil(maxTime / 60);
  return `${minHours}~${maxHours}시간`;
}

/**
 * 상태별 메시지
 */
function getStatusMessage(status: BatchStatus, progress: number): string {
  switch (status) {
    case 'idle':
      return '전사 대기 중';
    case 'downloading':
      return '영상 다운로드 중...';
    case 'transcribing':
      return `음성 인식 중... (${progress}%)`;
    case 'polling':
      return `서버 처리 중... (${progress}%)`;
    case 'completed':
      return '전사 완료!';
    case 'failed':
      return '전사 실패';
    default:
      return '';
  }
}

/**
 * 상태별 아이콘/색상
 */
function getStatusStyle(status: BatchStatus): { icon: string; color: string } {
  switch (status) {
    case 'idle':
      return { icon: '📝', color: 'text-gray-400' };
    case 'downloading':
      return { icon: '⬇️', color: 'text-blue-400' };
    case 'transcribing':
      return { icon: '🎙️', color: 'text-yellow-400' };
    case 'polling':
      return { icon: '⏳', color: 'text-orange-400' };
    case 'completed':
      return { icon: '✅', color: 'text-green-400' };
    case 'failed':
      return { icon: '❌', color: 'text-red-400' };
    default:
      return { icon: '', color: '' };
  }
}

/**
 * 시간 포맷팅 (ms → HH:MM:SS)
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function BatchTranscribePanel({
  videoUrl,
  onComplete,
  onSubtitleClick,
  className,
}: BatchTranscribePanelProps) {
  const {
    status,
    progress,
    subtitles,
    error,
    estimatedTime,
    startTranscription,
    reset,
  } = useBatchTranscribe();

  const [cachedSubtitles, setCachedSubtitles] = useState<BatchSubtitle[] | null>(null);
  const [checkingCache, setCheckingCache] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  const { icon, color } = getStatusStyle(status);

  // 캐시 확인
  useEffect(() => {
    const checkCache = async () => {
      setCheckingCache(true);
      const cached = await getCachedTranscription(videoUrl);
      if (cached && cached.length > 0) {
        console.log('[BatchPanel] Found cached subtitles:', cached.length);
        setCachedSubtitles(cached);
      }
      setCheckingCache(false);
    };
    checkCache();
  }, [videoUrl]);

  // 알림 권한 요청
  useEffect(() => {
    const requestPermission = async () => {
      const granted = await requestNotificationPermission();
      setNotificationEnabled(granted);
    };
    requestPermission();
  }, []);

  // 전사 완료 시 알림 및 캐시 저장
  useEffect(() => {
    if (status === 'completed' && subtitles.length > 0) {
      // 캐시 저장
      setCachedTranscription(videoUrl, subtitles);

      // 알림 (탭이 백그라운드일 때만)
      if (document.hidden && notificationEnabled) {
        notifyTranscriptionComplete(subtitles.length);
      }

      // 콜백 호출
      onComplete?.(subtitles);
    }
  }, [status, subtitles, videoUrl, notificationEnabled, onComplete]);

  // 전사 실패 시 알림
  useEffect(() => {
    if (status === 'failed' && error && document.hidden && notificationEnabled) {
      notifyTranscriptionFailed(error);
    }
  }, [status, error, notificationEnabled]);

  // 캐시된 자막 사용
  const handleUseCached = useCallback(() => {
    if (cachedSubtitles) {
      onComplete?.(cachedSubtitles);
    }
  }, [cachedSubtitles, onComplete]);

  const handleStart = async () => {
    await startTranscription(videoUrl);
  };

  const handleRetry = () => {
    reset();
    handleStart();
  };

  // MP4가 아니면 표시하지 않음
  if (!isMp4Video(videoUrl)) {
    return null;
  }

  return (
    <div className={cn('bg-slate-800 rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium flex items-center gap-2">
          <span>🎬</span>
          <span>MP4 배치 전사</span>
        </h3>
        <span className={cn('text-sm', color)}>
          {icon} {getStatusMessage(status, progress)}
        </span>
      </div>

      {/* 진행률 바 */}
      {(status === 'downloading' || status === 'transcribing' || status === 'polling') && (
        <div className="mb-3">
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {estimatedTime ? `예상 시간: ${estimatedTime}` : '처리 중...'}
          </p>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* 캐시 안내 */}
      {status === 'idle' && cachedSubtitles && (
        <div className="mb-3 p-3 bg-green-900/30 border border-green-700 rounded">
          <p className="text-green-300 text-sm mb-2">
            ✅ 이전에 생성된 자막 {cachedSubtitles.length}개가 있습니다.
          </p>
          <button
            onClick={handleUseCached}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
          >
            캐시된 자막 사용
          </button>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2">
        {status === 'idle' && (
          <button
            onClick={handleStart}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            🎙️ {cachedSubtitles ? '다시 전사' : '전사 시작'}
          </button>
        )}

        {(status === 'downloading' || status === 'transcribing' || status === 'polling') && (
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            취소
          </button>
        )}

        {status === 'failed' && (
          <button
            onClick={handleRetry}
            className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
          >
            🔄 다시 시도
          </button>
        )}

        {status === 'completed' && (
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            ✅ 완료 ({subtitles.length}개 자막)
          </button>
        )}
      </div>

      {/* 자막 미리보기 (완료 시) */}
      {status === 'completed' && subtitles.length > 0 && (
        <div className="mt-4 max-h-60 overflow-y-auto">
          <p className="text-xs text-gray-400 mb-2">
            총 {subtitles.length}개 자막 (클릭하여 이동)
          </p>
          <div className="space-y-1">
            {subtitles.slice(0, 20).map((subtitle) => (
              <div
                key={subtitle.id}
                onClick={() => onSubtitleClick?.(subtitle)}
                className="p-2 bg-slate-700 rounded text-sm cursor-pointer hover:bg-slate-600 transition-colors"
              >
                <span className="text-gray-400 text-xs">
                  [{formatTime(subtitle.startTime)}]
                </span>
                <span className="text-white ml-2">{subtitle.text}</span>
              </div>
            ))}
            {subtitles.length > 20 && (
              <p className="text-gray-400 text-xs text-center py-2">
                ... 외 {subtitles.length - 20}개
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
