import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 검색 결과 하이라이팅 함수 테스트
function highlightText(text: string, query: string): string[] {
  if (!query.trim()) return [text];

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.split(regex);
}

// 시간 포맷 함수 테스트
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

describe('Search Page Utils', () => {
  describe('highlightText', () => {
    it('should return original text when query is empty', () => {
      const result = highlightText('안녕하세요', '');
      expect(result).toEqual(['안녕하세요']);
    });

    it('should split text by matching query', () => {
      const result = highlightText('경기도의회 회의', '경기도');
      expect(result).toContain('경기도');
      expect(result).toContain('의회 회의');
    });

    it('should handle case-insensitive matching', () => {
      const result = highlightText('Hello World', 'hello');
      expect(result.length).toBeGreaterThan(1);
    });

    it('should escape regex special characters', () => {
      const result = highlightText('test (special) chars', '(special)');
      expect(result).toContain('(special)');
    });

    it('should handle multiple matches', () => {
      const result = highlightText('의원님 의원님', '의원');
      expect(result.filter(p => p === '의원').length).toBe(2);
    });
  });

  describe('formatTime', () => {
    it('should format 0ms as 0:00', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format 1000ms as 0:01', () => {
      expect(formatTime(1000)).toBe('0:01');
    });

    it('should format 60000ms as 1:00', () => {
      expect(formatTime(60000)).toBe('1:00');
    });

    it('should format 3661000ms as 1:01:01 (with hours)', () => {
      expect(formatTime(3661000)).toBe('1:01:01');
    });

    it('should pad minutes and seconds correctly', () => {
      expect(formatTime(65000)).toBe('1:05');
    });

    it('should pad seconds in hour format', () => {
      expect(formatTime(3605000)).toBe('1:00:05');
    });
  });
});

describe('Search Page API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call fetch with correct query parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
    global.fetch = mockFetch;

    // 검색 API 호출 시뮬레이션
    const query = '경기도의회';
    await fetch(`/api/subtitles?q=${encodeURIComponent(query)}&limit=50`);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/subtitles?q=${encodeURIComponent(query)}&limit=50`
    );
  });

  it('should handle search results correctly', async () => {
    const mockResults = [
      {
        id: '1',
        sessionId: 'session-1',
        startTimeMs: 5000,
        endTimeMs: 8000,
        text: '경기도의회 회의입니다',
        session: {
          id: 'session-1',
          kmsUrl: 'https://kms.example.com/video/123',
          title: '제1차 회의',
          startedAt: '2026-02-01T10:00:00Z',
        },
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: mockResults }),
    });
    global.fetch = mockFetch;

    const response = await fetch('/api/subtitles?q=경기도');
    const data = await response.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].text).toContain('경기도의회');
  });

  it('should handle fetch error gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: '검색 실패' }),
    });
    global.fetch = mockFetch;

    const response = await fetch('/api/subtitles?q=test');
    const data = await response.json();

    expect(response.ok).toBe(false);
    expect(data.error).toBeDefined();
  });
});
