import { describe, it, expect, vi, beforeEach } from 'vitest';

// SRT/VTT 변환 함수 테스트용 (실제 route.ts에서 추출한 로직)
function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

function msToVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function toSrt(subtitleList: { startTimeMs: number; endTimeMs: number; text: string }[]): string {
  return subtitleList
    .map((sub, index) => {
      return `${index + 1}\n${msToSrtTime(sub.startTimeMs)} --> ${msToSrtTime(sub.endTimeMs)}\n${sub.text}\n`;
    })
    .join('\n');
}

function toVtt(subtitleList: { startTimeMs: number; endTimeMs: number; text: string }[]): string {
  const header = 'WEBVTT\n\n';
  const cues = subtitleList
    .map((sub, index) => {
      return `${index + 1}\n${msToVttTime(sub.startTimeMs)} --> ${msToVttTime(sub.endTimeMs)}\n${sub.text}\n`;
    })
    .join('\n');

  return header + cues;
}

describe('Subtitle Export', () => {
  describe('msToSrtTime', () => {
    it('should convert 0ms to 00:00:00,000', () => {
      expect(msToSrtTime(0)).toBe('00:00:00,000');
    });

    it('should convert 1000ms to 00:00:01,000', () => {
      expect(msToSrtTime(1000)).toBe('00:00:01,000');
    });

    it('should convert 61500ms to 00:01:01,500', () => {
      expect(msToSrtTime(61500)).toBe('00:01:01,500');
    });

    it('should convert 3661500ms to 01:01:01,500', () => {
      expect(msToSrtTime(3661500)).toBe('01:01:01,500');
    });

    it('should handle edge case with 999ms', () => {
      expect(msToSrtTime(999)).toBe('00:00:00,999');
    });
  });

  describe('msToVttTime', () => {
    it('should use dot instead of comma for milliseconds', () => {
      expect(msToVttTime(1500)).toBe('00:00:01.500');
    });

    it('should convert 3661500ms to 01:01:01.500', () => {
      expect(msToVttTime(3661500)).toBe('01:01:01.500');
    });
  });

  describe('toSrt', () => {
    it('should generate valid SRT format', () => {
      const subtitles = [
        { startTimeMs: 0, endTimeMs: 2000, text: '안녕하세요' },
        { startTimeMs: 2500, endTimeMs: 5000, text: '경기도의회입니다' },
      ];

      const result = toSrt(subtitles);

      expect(result).toContain('1\n00:00:00,000 --> 00:00:02,000\n안녕하세요');
      expect(result).toContain('2\n00:00:02,500 --> 00:00:05,000\n경기도의회입니다');
    });

    it('should handle empty array', () => {
      expect(toSrt([])).toBe('');
    });

    it('should handle single subtitle', () => {
      const subtitles = [{ startTimeMs: 0, endTimeMs: 1000, text: '테스트' }];
      const result = toSrt(subtitles);

      expect(result).toBe('1\n00:00:00,000 --> 00:00:01,000\n테스트\n');
    });
  });

  describe('toVtt', () => {
    it('should include WEBVTT header', () => {
      const subtitles = [{ startTimeMs: 0, endTimeMs: 1000, text: '테스트' }];
      const result = toVtt(subtitles);

      expect(result.startsWith('WEBVTT\n\n')).toBe(true);
    });

    it('should use dot for milliseconds separator', () => {
      const subtitles = [{ startTimeMs: 1500, endTimeMs: 3500, text: '테스트' }];
      const result = toVtt(subtitles);

      expect(result).toContain('00:00:01.500 --> 00:00:03.500');
    });

    it('should handle empty array', () => {
      expect(toVtt([])).toBe('WEBVTT\n\n');
    });
  });
});
