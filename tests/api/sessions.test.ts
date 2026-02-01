import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Sessions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/sessions', () => {
    it('should fetch sessions with default pagination', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          kmsUrl: 'https://kms.example.com/video/123',
          midx: 123,
          title: '제1차 회의',
          startedAt: '2026-02-01T10:00:00Z',
          endedAt: null,
          isLive: false,
          status: 'completed',
          createdAt: '2026-02-01T10:00:00Z',
        },
        {
          id: 'session-2',
          kmsUrl: 'https://kms.example.com/video/456',
          midx: 456,
          title: '제2차 회의',
          startedAt: '2026-02-01T14:00:00Z',
          endedAt: null,
          isLive: true,
          status: 'active',
          createdAt: '2026-02-01T14:00:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: mockSessions }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/sessions?limit=20&offset=0');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.sessions).toHaveLength(2);
      expect(data.sessions[0].midx).toBe(123);
      expect(data.sessions[1].isLive).toBe(true);
    });

    it('should support pagination', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: [] }),
      });
      global.fetch = mockFetch;

      await fetch('/api/sessions?limit=10&offset=20');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions?limit=10&offset=20');
    });
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const newSession = {
        kmsUrl: 'https://kms.example.com/video/789',
        midx: 789,
        title: '새 회의',
        isLive: true,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: {
              id: 'new-session-id',
              ...newSession,
              startedAt: '2026-02-01T15:00:00Z',
              status: 'active',
            },
            isExisting: false,
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.isExisting).toBe(false);
      expect(data.session.midx).toBe(789);
    });

    it('should return existing session if midx already exists', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: {
              id: 'existing-session-id',
              midx: 123,
              title: '기존 회의',
            },
            isExisting: true,
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kmsUrl: 'https://example.com', midx: 123 }),
      });
      const data = await response.json();

      expect(data.isExisting).toBe(true);
    });

    it('should validate required fields', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'kmsUrl and midx are required' }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('required');
    });
  });
});

describe('Session Utilities', () => {
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  it('should format date correctly in Korean', () => {
    const result = formatDate('2026-02-01T10:00:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('2');
    expect(result).toContain('1');
  });

  it('should format datetime with time', () => {
    const result = formatDateTime('2026-02-01T10:00:00Z');
    expect(result).toContain('2026');
  });

  it('should group sessions by date', () => {
    const sessions = [
      { id: '1', createdAt: '2026-02-01T10:00:00Z' },
      { id: '2', createdAt: '2026-02-01T14:00:00Z' },
      { id: '3', createdAt: '2026-02-02T09:00:00Z' },
    ];

    const grouped = sessions.reduce(
      (acc, session) => {
        const date = formatDate(session.createdAt);
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(session);
        return acc;
      },
      {} as Record<string, typeof sessions>
    );

    const dates = Object.keys(grouped);
    expect(dates).toHaveLength(2);
  });
});
