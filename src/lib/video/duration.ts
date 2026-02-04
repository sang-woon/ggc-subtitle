/**
 * 비디오 길이 확인 유틸리티
 */

/**
 * 비디오 URL에서 메타데이터를 로드하여 길이(ms) 반환
 */
export async function getVideoDuration(videoUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const durationMs = Math.floor(video.duration * 1000);
      video.remove();
      resolve(durationMs);
    };

    video.onerror = () => {
      video.remove();
      reject(new Error('Failed to load video metadata'));
    };

    // CORS 설정
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
  });
}

/**
 * 4시간(RTZR 제한)을 초과하는지 확인
 */
export function exceedsMaxDuration(durationMs: number): boolean {
  const fourHoursMs = 4 * 60 * 60 * 1000; // 4시간
  return durationMs > fourHoursMs;
}

/**
 * 청크 정보 생성 (1시간 단위)
 */
export interface ChunkInfo {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export function calculateChunks(totalDurationMs: number, chunkDurationMs: number = 60 * 60 * 1000): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  let startMs = 0;
  let index = 0;

  while (startMs < totalDurationMs) {
    const endMs = Math.min(startMs + chunkDurationMs, totalDurationMs);
    chunks.push({
      index,
      startMs,
      endMs,
      durationMs: endMs - startMs,
    });
    startMs = endMs;
    index++;
  }

  return chunks;
}

/**
 * 예상 처리 시간 계산 (분 단위)
 * - 단일 처리: 영상 길이의 25~50%
 * - 병렬 처리(5개): 가장 긴 청크 기준
 */
export function estimateProcessingTime(
  durationMs: number,
  parallelCount: number = 5
): { minMinutes: number; maxMinutes: number } {
  const durationMin = durationMs / 60000;

  if (!exceedsMaxDuration(durationMs)) {
    // 단일 처리
    return {
      minMinutes: Math.ceil(durationMin * 0.25),
      maxMinutes: Math.ceil(durationMin * 0.5),
    };
  }

  // 분할 처리
  const chunks = calculateChunks(durationMs);
  const parallelGroups = Math.ceil(chunks.length / parallelCount);
  const longestChunkMin = Math.max(...chunks.map(c => c.durationMs)) / 60000;

  return {
    minMinutes: Math.ceil(longestChunkMin * 0.25 * parallelGroups),
    maxMinutes: Math.ceil(longestChunkMin * 0.5 * parallelGroups),
  };
}
