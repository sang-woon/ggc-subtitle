'use client';

import React, { useState } from 'react';

import { downloadTranscript } from '../lib/api';

interface TranscriptExportButtonProps {
  meetingId: string;
  meetingTitle: string;
}

const FORMAT_OPTIONS = [
  { value: 'markdown' as const, label: '회의록 (MD)', desc: 'Markdown 형식 회의록' },
  { value: 'official' as const, label: '공식 회의록', desc: '발언자 중심 텍스트 포맷' },
  { value: 'srt' as const, label: '자막 (SRT)', desc: '표준 자막 파일' },
  { value: 'json' as const, label: '데이터 (JSON)', desc: '시스템 연계용' },
];

export default function TranscriptExportButton({
  meetingId,
  meetingTitle,
}: TranscriptExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: 'markdown' | 'srt' | 'json' | 'official') => {
    try {
      setIsLoading(true);
      setError(null);
      await downloadTranscript(meetingId, format);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isLoading ? '다운로드 중...' : '회의록 내보내기'}
      </button>

      {isOpen && !isLoading && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs text-gray-500 truncate">{meetingTitle}</p>
          </div>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleExport(opt.value)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0"
            >
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500 text-center">{error}</p>
      )}
    </div>
  );
}
