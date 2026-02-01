// @TASK T1.5 - 자막 API 클라이언트
// @SPEC docs/planning/06-tasks.md#t15

import type { Subtitle, UpdateSubtitleRequest } from '@/types/subtitle';

/**
 * 자막 수정
 */
export async function updateSubtitle(
  id: string,
  data: UpdateSubtitleRequest
): Promise<Subtitle> {
  const response = await fetch(`/api/subtitles/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update subtitle: ${response.status}`);
  }

  const result = await response.json();
  return result.subtitle;
}

/**
 * 자막 삭제
 */
export async function deleteSubtitle(id: string): Promise<void> {
  const response = await fetch(`/api/subtitles/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to delete subtitle: ${response.status}`);
  }
}

/**
 * 세션의 자막 목록 조회
 */
export async function getSubtitles(sessionId: string): Promise<Subtitle[]> {
  const response = await fetch(`/api/subtitles?sessionId=${sessionId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch subtitles: ${response.status}`);
  }

  const result = await response.json();
  return result.subtitles || [];
}
