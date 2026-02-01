import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Subtitles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/subtitles', () => {
    it('should save a new subtitle', async () => {
      const newSubtitle = {
        sessionId: 'session-1',
        startTimeMs: 5000,
        endTimeMs: 8000,
        text: '안녕하세요',
        confidence: 0.95,
        seq: 1,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            subtitle: {
              id: 'subtitle-1',
              ...newSubtitle,
              isEdited: false,
              createdAt: '2026-02-01T10:00:00Z',
            },
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubtitle),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.subtitle.text).toBe('안녕하세요');
      expect(data.subtitle.confidence).toBe(0.95);
    });

    it('should validate required fields', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'sessionId, startTimeMs, and text are required' }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '텍스트만' }),
      });
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('required');
    });

    it('should use default endTimeMs if not provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            subtitle: {
              id: 'subtitle-1',
              startTimeMs: 5000,
              endTimeMs: 8000, // startTimeMs + 3000
              text: '테스트',
            },
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          startTimeMs: 5000,
          text: '테스트',
        }),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.subtitle.endTimeMs).toBe(8000);
    });
  });

  describe('GET /api/subtitles', () => {
    it('should fetch subtitles by sessionId', async () => {
      const mockSubtitles = [
        { id: '1', startTimeMs: 0, endTimeMs: 3000, text: '첫 번째' },
        { id: '2', startTimeMs: 3500, endTimeMs: 6500, text: '두 번째' },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subtitles: mockSubtitles }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles?sessionId=session-1');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.subtitles).toHaveLength(2);
    });

    it('should search subtitles by query', async () => {
      const mockResults = [
        {
          id: '1',
          sessionId: 'session-1',
          text: '경기도의회 회의입니다',
          session: { title: '제1차 회의' },
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: mockResults, query: '경기도' }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles?q=경기도');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.query).toBe('경기도');
      expect(data.results).toHaveLength(1);
    });

    it('should require sessionId or query parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'sessionId or q parameter is required' }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles');
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('required');
    });
  });

  describe('PUT /api/subtitles/[id]', () => {
    it('should update subtitle text', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            subtitle: {
              id: 'subtitle-1',
              text: '수정된 텍스트',
              isEdited: true,
              originalText: '원본 텍스트',
            },
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles/subtitle-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '수정된 텍스트' }),
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.subtitle.isEdited).toBe(true);
      expect(data.subtitle.originalText).toBe('원본 텍스트');
    });

    it('should preserve original text on first edit', async () => {
      // 첫 번째 수정 시 originalText 저장
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            subtitle: {
              id: 'subtitle-1',
              text: '첫 수정',
              isEdited: true,
              originalText: 'STT 원본',
            },
          }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles/subtitle-1', {
        method: 'PUT',
        body: JSON.stringify({ text: '첫 수정' }),
      });
      const data = await response.json();

      expect(data.subtitle.originalText).toBe('STT 원본');
    });
  });

  describe('DELETE /api/subtitles/[id]', () => {
    it('should delete a subtitle', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/subtitles/subtitle-1', {
        method: 'DELETE',
      });
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });
});

describe('Subtitle Batch API', () => {
  it('should save multiple subtitles at once', async () => {
    const batchSubtitles = [
      { sessionId: 'session-1', startTimeMs: 0, endTimeMs: 3000, text: '첫째' },
      { sessionId: 'session-1', startTimeMs: 3500, endTimeMs: 6500, text: '둘째' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          subtitles: batchSubtitles.map((s, i) => ({ ...s, id: `id-${i}` })),
          count: 2,
        }),
    });
    global.fetch = mockFetch;

    const response = await fetch('/api/subtitles/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtitles: batchSubtitles }),
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.count).toBe(2);
  });
});
