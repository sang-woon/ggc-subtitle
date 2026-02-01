'use client';

import { useState } from 'react';
import { cn, extractMidx } from '@/lib/utils';

interface UrlInputProps {
  onSubmit: (url: string, midx: number | null) => void;
  isLoading?: boolean;
  className?: string;
}

export function UrlInput({ onSubmit, isLoading = false, className }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('URL을 입력해주세요.');
      return;
    }

    // KMS URL 검증
    if (!url.includes('kms.ggc.go.kr')) {
      setError('KMS URL만 지원합니다. (kms.ggc.go.kr)');
      return;
    }

    const midx = extractMidx(url);
    onSubmit(url, midx);
  };

  return (
    <form onSubmit={handleSubmit} className={cn('w-full', className)}>
      <div className="flex flex-col gap-2">
        <label htmlFor="url-input" className="text-sm font-medium text-gray-700">
          영상 URL
        </label>
        <div className="flex gap-2">
          <input
            id="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://kms.ggc.go.kr/caster/player/vodViewer.do?midx=..."
            className={cn(
              'flex-1 px-4 py-3 border rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              error ? 'border-red-300' : 'border-gray-300'
            )}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'px-6 py-3 bg-blue-600 text-white rounded-lg font-medium',
              'hover:bg-blue-700 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-2'
            )}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                로딩 중
              </>
            ) : (
              '시작'
            )}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-500">
          경기도의회 KMS 영상 URL을 입력하세요.
        </p>
      </div>
    </form>
  );
}
