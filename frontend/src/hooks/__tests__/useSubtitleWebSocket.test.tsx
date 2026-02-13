/**
 * useSubtitleWebSocket 훅 테스트
 *
 * TDD RED Phase - 테스트 먼저 작성
 *
 * 테스트 케이스:
 * 1. WebSocket 연결 성공
 * 2. subtitle_created 이벤트 수신 및 상태 업데이트
 * 3. 연결 끊김 시 자동 재연결 (exponential backoff)
 * 4. 수동 연결/해제
 * 5. 컴포넌트 언마운트 시 연결 정리
 * 6. 에러 상태 처리
 * 7. 자막 배열 초기화 (clearSubtitles)
 */

import { renderHook, act } from '@testing-library/react';

import type { SubtitleType } from '@/types';

import { useSubtitleWebSocket } from '../useSubtitleWebSocket';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static lastUrl: string | null = null;

  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastUrl = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose(code: number = 1000, wasClean: boolean = true) {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, wasClean }));
    }
  }

  static clearInstances() {
    MockWebSocket.instances = [];
    MockWebSocket.lastUrl = null;
  }

  static getLastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// Replace global WebSocket with mock
const originalWebSocket = global.WebSocket;

// Mock environment variable
const mockWsUrl = 'ws://localhost:8000';
process.env.NEXT_PUBLIC_WS_URL = mockWsUrl;

// Mock subtitle data
const mockSubtitle: SubtitleType = {
  id: 'subtitle-1',
  meeting_id: 'meeting-1',
  start_time: 0,
  end_time: 5,
  text: '안녕하세요, 회의를 시작하겠습니다.',
  speaker: '의장',
  confidence: 0.95,
  created_at: '2026-02-05T10:00:00Z',
};

const mockSubtitle2: SubtitleType = {
  id: 'subtitle-2',
  meeting_id: 'meeting-1',
  start_time: 5,
  end_time: 10,
  text: '오늘의 안건은 예산안 심의입니다.',
  speaker: '의장',
  confidence: 0.92,
  created_at: '2026-02-05T10:00:05Z',
};

describe('useSubtitleWebSocket', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.clearInstances();
    (global as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  describe('Connection', () => {
    it('should connect to WebSocket when autoConnect is true (default)', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      expect(result.current.connectionStatus).toBe('connecting');
      expect(MockWebSocket.lastUrl).toBe(`${mockWsUrl}/ws/meetings/meeting-1/subtitles`);
    });

    it('should not connect when autoConnect is false', () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1', autoConnect: false })
      );

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(MockWebSocket.instances.length).toBe(0);
    });

    it('should update status to connected when WebSocket opens', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();
      expect(ws).toBeDefined();

      act(() => {
        ws!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should return empty subtitles array initially', () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      expect(result.current.subtitles).toEqual([]);
    });
  });

  describe('Receiving subtitles', () => {
    it('should receive and store subtitle_created events', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle },
        });
      });

      expect(result.current.subtitles).toHaveLength(1);
      expect(result.current.subtitles[0]).toEqual(mockSubtitle);
    });

    it('should accumulate multiple subtitles', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle },
        });
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle2 },
        });
      });

      expect(result.current.subtitles).toHaveLength(2);
      expect(result.current.subtitles[0]).toEqual(mockSubtitle);
      expect(result.current.subtitles[1]).toEqual(mockSubtitle2);
    });

    it('should call onSubtitle callback when subtitle is received', async () => {
      const onSubtitle = jest.fn();

      renderHook(() =>
        useSubtitleWebSocket({
          meetingId: 'meeting-1',
          onSubtitle,
        })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle },
        });
      });

      expect(onSubtitle).toHaveBeenCalledTimes(1);
      expect(onSubtitle).toHaveBeenCalledWith(mockSubtitle);
    });

    it('should handle invalid JSON messages gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      // Send invalid JSON
      act(() => {
        if (ws!.onmessage) {
          ws!.onmessage(new MessageEvent('message', { data: 'invalid json {{{' }));
        }
      });

      // Should not add any subtitles
      expect(result.current.subtitles).toHaveLength(0);
      // Should log error
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should ignore non-subtitle_created events', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      act(() => {
        ws!.simulateMessage({
          type: 'meeting_status_changed',
          payload: { meeting_id: 'meeting-1', status: 'ended' },
        });
      });

      expect(result.current.subtitles).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should update status to error when WebSocket error occurs', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateError();
      });

      expect(result.current.connectionStatus).toBe('error');
    });

    it('should update status to disconnected when connection closes', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');

      act(() => {
        ws!.simulateClose();
      });

      // After close, it should start reconnecting, so status would be 'connecting' or 'disconnected'
      // depending on implementation. For clean close, it might stay disconnected.
      expect(['disconnected', 'connecting']).toContain(result.current.connectionStatus);
    });
  });

  describe('Auto-reconnect', () => {
    it('should attempt to reconnect after unexpected close', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const initialInstanceCount = MockWebSocket.instances.length;
      const ws1 = MockWebSocket.getLastInstance();

      act(() => {
        ws1!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');

      // Simulate unexpected close (wasClean = false)
      act(() => {
        ws1!.simulateClose(1006, false);
      });

      // Should be trying to reconnect
      expect(result.current.connectionStatus).toBe('connecting');

      // Advance timer by initial delay (1000ms)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // A new WebSocket should be created
      expect(MockWebSocket.instances.length).toBe(initialInstanceCount + 1);
    });

    it('should use exponential backoff for subsequent reconnect attempts', async () => {
      renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws1 = MockWebSocket.getLastInstance();

      act(() => {
        ws1!.simulateOpen();
      });

      // First unexpected close
      act(() => {
        ws1!.simulateClose(1006, false);
      });

      // First reconnect after 1000ms
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const ws2 = MockWebSocket.getLastInstance();
      const instancesAfterFirstReconnect = MockWebSocket.instances.length;

      // Second unexpected close (without opening - simulating immediate failure)
      act(() => {
        ws2!.simulateClose(1006, false);
      });

      // Should not reconnect before 2000ms (exponential backoff: 1000 * 2^1 = 2000)
      act(() => {
        jest.advanceTimersByTime(1999);
      });

      expect(MockWebSocket.instances.length).toBe(instancesAfterFirstReconnect);

      // Should reconnect at 2000ms
      act(() => {
        jest.advanceTimersByTime(1);
      });

      expect(MockWebSocket.instances.length).toBe(instancesAfterFirstReconnect + 1);
    });

    it('should not reconnect when manually disconnected', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      // Manually disconnect
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.connectionStatus).toBe('disconnected');

      // Advance timer
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should not create new WebSocket
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('should reset reconnect attempts on successful connection', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws1 = MockWebSocket.getLastInstance();

      // First connection fails
      act(() => {
        ws1!.simulateClose(1006, false);
      });

      // Wait for reconnect
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const ws2 = MockWebSocket.getLastInstance();

      // Second connection succeeds
      act(() => {
        ws2!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');

      // Close again
      act(() => {
        ws2!.simulateClose(1006, false);
      });

      // Should start from initial delay (1000ms) since attempts were reset
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(MockWebSocket.instances.length).toBe(3);
    });
  });

  describe('Manual connect/disconnect', () => {
    it('should allow manual connection when autoConnect is false', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1', autoConnect: false })
      );

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(MockWebSocket.instances.length).toBe(0);

      act(() => {
        result.current.connect();
      });

      expect(result.current.connectionStatus).toBe('connecting');
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('should close connection when disconnect is called', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should reconnect when connect is called after disconnect', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws1 = MockWebSocket.getLastInstance();

      act(() => {
        ws1!.simulateOpen();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(MockWebSocket.instances.length).toBe(1);

      act(() => {
        result.current.connect();
      });

      expect(MockWebSocket.instances.length).toBe(2);
      expect(result.current.connectionStatus).toBe('connecting');
    });
  });

  describe('clearSubtitles', () => {
    it('should clear all subtitles when clearSubtitles is called', async () => {
      const { result } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle },
        });
      });

      act(() => {
        ws!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle2 },
        });
      });

      expect(result.current.subtitles).toHaveLength(2);

      act(() => {
        result.current.clearSubtitles();
      });

      expect(result.current.subtitles).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    it('should close WebSocket on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');

      unmount();

      expect(ws!.readyState).toBe(WebSocket.CLOSED);
    });

    it('should not attempt reconnect after unmount', async () => {
      const { unmount } = renderHook(() =>
        useSubtitleWebSocket({ meetingId: 'meeting-1' })
      );

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        ws!.simulateOpen();
      });

      unmount();

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should only have the initial WebSocket instance
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  describe('Meeting ID changes', () => {
    it('should reconnect when meetingId changes', async () => {
      const { result, rerender } = renderHook(
        ({ meetingId }: { meetingId: string }) =>
          useSubtitleWebSocket({ meetingId }),
        { initialProps: { meetingId: 'meeting-1' } }
      );

      const ws1 = MockWebSocket.getLastInstance();

      act(() => {
        ws1!.simulateOpen();
      });

      act(() => {
        ws1!.simulateMessage({
          type: 'subtitle_created',
          payload: { subtitle: mockSubtitle },
        });
      });

      expect(result.current.subtitles).toHaveLength(1);

      // Change meeting ID
      rerender({ meetingId: 'meeting-2' });

      expect(MockWebSocket.instances.length).toBe(2);
      expect(MockWebSocket.lastUrl).toBe(`${mockWsUrl}/ws/meetings/meeting-2/subtitles`);

      // Subtitles should be cleared when meeting changes
      expect(result.current.subtitles).toHaveLength(0);
    });
  });
});
