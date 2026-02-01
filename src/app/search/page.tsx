'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

interface SearchResult {
  id: string;
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  session: {
    id: string;
    kmsUrl: string;
    title: string | null;
    startedAt: string;
  } | null;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await fetch(`/api/subtitles?q=${encodeURIComponent(query)}&limit=50`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '검색에 실패했습니다');
      }

      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const groupedResults = results.reduce((acc, result) => {
    const sessionId = result.sessionId;
    if (!acc[sessionId]) {
      acc[sessionId] = {
        session: result.session,
        subtitles: [],
      };
    }
    acc[sessionId].subtitles.push(result);
    return acc;
  }, {} as Record<string, { session: SearchResult['session']; subtitles: SearchResult[] }>);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">자막 검색</h1>
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            홈으로
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 검색 폼 */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="자막 내용을 검색하세요..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '검색 중...' : '검색'}
            </button>
          </div>
        </form>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* 검색 결과 */}
        {hasSearched && !isLoading && (
          <div>
            <p className="text-gray-600 mb-4">
              &ldquo;{query}&rdquo; 검색 결과: {results.length}개
            </p>

            {results.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedResults).map(([sessionId, { session, subtitles }]) => (
                  <div key={sessionId} className="bg-white rounded-lg shadow overflow-hidden">
                    {/* 세션 헤더 */}
                    <div className="bg-gray-50 border-b px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {session?.title || `세션 ${sessionId.slice(0, 8)}`}
                          </h3>
                          {session?.startedAt && (
                            <p className="text-sm text-gray-500">
                              {formatDate(session.startedAt)}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/history/${sessionId}`}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          세션 보기 →
                        </Link>
                      </div>
                    </div>

                    {/* 자막 결과 */}
                    <div className="divide-y">
                      {subtitles.map((subtitle) => (
                        <Link
                          key={subtitle.id}
                          href={`/history/${sessionId}?t=${subtitle.startTimeMs}`}
                          className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-sm text-blue-600 font-mono whitespace-nowrap">
                              {formatTime(subtitle.startTimeMs)}
                            </span>
                            <p className="text-gray-700 flex-1">
                              {highlightText(subtitle.text, query)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 초기 안내 */}
        {!hasSearched && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-gray-400 text-4xl mb-4">🔍</div>
            <p className="text-gray-600">
              검색어를 입력하여 저장된 자막에서 원하는 내용을 찾아보세요.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
