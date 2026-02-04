/**
 * 전사 결과 캐싱 (IndexedDB 사용)
 */

import { BatchSubtitle } from '@/hooks/useBatchTranscribe';

const DB_NAME = 'ggc-subtitle-cache';
const DB_VERSION = 1;
const STORE_NAME = 'transcriptions';

interface CachedTranscription {
  url: string;
  subtitles: BatchSubtitle[];
  createdAt: number;
  expiresAt: number;
}

/**
 * IndexedDB 열기
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });
}

/**
 * URL 정규화 (캐시 키 생성)
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // midx 파라미터만 추출
    const midx = urlObj.searchParams.get('midx');
    if (midx) {
      return `midx:${midx}`;
    }
    // 없으면 전체 URL 사용
    return url;
  } catch {
    return url;
  }
}

/**
 * 캐시에서 전사 결과 가져오기
 */
export async function getCachedTranscription(videoUrl: string): Promise<BatchSubtitle[] | null> {
  try {
    const db = await openDB();
    const key = normalizeUrl(videoUrl);

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const result = request.result as CachedTranscription | undefined;

        if (!result) {
          resolve(null);
          return;
        }

        // 만료 확인 (24시간)
        if (Date.now() > result.expiresAt) {
          // 만료된 캐시 삭제
          deleteCachedTranscription(videoUrl);
          resolve(null);
          return;
        }

        console.log('[Cache] Hit for:', key);
        resolve(result.subtitles);
      };
    });
  } catch (error) {
    console.error('[Cache] Error getting cache:', error);
    return null;
  }
}

/**
 * 전사 결과 캐시에 저장
 */
export async function setCachedTranscription(
  videoUrl: string,
  subtitles: BatchSubtitle[],
  ttlMs: number = 24 * 60 * 60 * 1000 // 기본 24시간
): Promise<void> {
  try {
    const db = await openDB();
    const key = normalizeUrl(videoUrl);

    const data: CachedTranscription = {
      url: key,
      subtitles,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[Cache] Saved for:', key, 'subtitles:', subtitles.length);
        resolve();
      };
    });
  } catch (error) {
    console.error('[Cache] Error setting cache:', error);
  }
}

/**
 * 캐시 삭제
 */
export async function deleteCachedTranscription(videoUrl: string): Promise<void> {
  try {
    const db = await openDB();
    const key = normalizeUrl(videoUrl);

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => resolve();
      request.onsuccess = () => {
        console.log('[Cache] Deleted:', key);
        resolve();
      };
    });
  } catch (error) {
    console.error('[Cache] Error deleting cache:', error);
  }
}

/**
 * 전체 캐시 삭제
 */
export async function clearTranscriptionCache(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => resolve();
      request.onsuccess = () => {
        console.log('[Cache] Cleared all');
        resolve();
      };
    });
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
  }
}
