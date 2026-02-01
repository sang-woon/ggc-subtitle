'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Session {
  id: string;
  kmsUrl: string;
  midx: number;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  isLive: boolean;
  status: string;
  createdAt: string;
}

interface SessionWithCount extends Session {
  subtitleCount?: number;
}

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

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const fetchSessions = useCallback(async (pageNum: number, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions?limit=${LIMIT}&offset=${pageNum * LIMIT}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '세션 목록을 불러올 수 없습니다');
      }

      const newSessions = data.sessions || [];
      setHasMore(newSessions.length === LIMIT);

      if (append) {
        setSessions(prev => [...prev, ...newSessions]);
      } else {
        setSessions(newSessions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(0);
  }, [fetchSessions]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSessions(nextPage, true);
  }, [page, fetchSessions]);

  // 세션을 날짜별로 그룹화
  const groupedSessions = sessions.reduce((acc, session) => {
    const date = formatDate(session.createdAt);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(session);
    return acc;
  }, {} as Record<string, SessionWithCount[]>);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">세션 히스토리</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/search"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              자막 검색
            </Link>
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              홈으로
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => fetchSessions(0)}
              className="mt-2 text-sm text-red-600 hover:text-red-700"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 세션 목록 */}
        {!error && sessions.length === 0 && !isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-gray-400 text-4xl mb-4">📝</div>
            <p className="text-gray-600">아직 저장된 세션이 없습니다.</p>
            <Link
              href="/"
              className="mt-4 inline-block text-blue-600 hover:text-blue-700"
            >
              새 자막 세션 시작하기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedSessions).map(([date, dateSessions]) => (
              <div key={date}>
                <h2 className="text-lg font-semibold text-gray-700 mb-4">{date}</h2>
                <div className="space-y-3">
                  {dateSessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/history/${session.id}`}
                      className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {session.title || `KMS 영상 ${session.midx}`}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                              {formatDateTime(session.startedAt)}
                              {session.endedAt && (
                                <span> ~ {formatDateTime(session.endedAt)}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {session.isLive && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                LIVE
                              </span>
                            )}
                            <span className="text-gray-400">→</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                          <span>MIDX: {session.midx}</span>
                          <span className={`px-2 py-0.5 rounded ${
                            session.status === 'active'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {/* 더 보기 버튼 */}
        {!isLoading && hasMore && sessions.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={loadMore}
              className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              더 보기
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
