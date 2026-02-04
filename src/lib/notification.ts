/**
 * 브라우저 알림 유틸리티
 */

/**
 * 알림 권한 요청
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

/**
 * 알림 표시
 */
export function showNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!('Notification' in window)) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  return new Notification(title, {
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    ...options,
  });
}

/**
 * 전사 완료 알림
 */
export function notifyTranscriptionComplete(subtitleCount: number): Notification | null {
  return showNotification('자막 생성 완료!', {
    body: `${subtitleCount}개의 자막이 생성되었습니다.`,
    tag: 'transcription-complete',
    requireInteraction: false,
  });
}

/**
 * 전사 실패 알림
 */
export function notifyTranscriptionFailed(error: string): Notification | null {
  return showNotification('자막 생성 실패', {
    body: error,
    tag: 'transcription-failed',
    requireInteraction: false,
  });
}
