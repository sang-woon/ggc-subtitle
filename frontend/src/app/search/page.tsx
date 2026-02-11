'use client';

import React, { useState, useEffect } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import Header from '@/components/Header';
import { globalSearch } from '@/lib/api';
import type { SearchResultItem, SearchResponse } from '@/lib/api';

/**
 * 시간 포맷 (초 → MM:SS)
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 검색어 하이라이트
 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * 검색 페이지 컨텐츠 (Suspense 내부)
 */
function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 쿼리에서 초기값 추출
  const initialQuery = searchParams.get('q') || '';
  const initialDateFrom = searchParams.get('date_from') || '';
  const initialDateTo = searchParams.get('date_to') || '';
  const initialSpeaker = searchParams.get('speaker') || '';

  // 상태
  const [query, setQuery] = useState(initialQuery);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [speaker, setSpeaker] = useState(initialSpeaker);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [offset, setOffset] = useState(0);

  const limit = 20;

  // 검색 실행
  const executeSearch = async (newOffset = 0) => {
    if (!query.trim()) {
      setError('검색어를 입력해주세요');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await globalSearch({
        q: query,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        speaker: speaker || undefined,
        limit,
        offset: newOffset,
      });

      setResults(response);
      setOffset(newOffset);

      // URL 업데이트
      const params = new URLSearchParams({ q: query });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (speaker) params.set('speaker', speaker);
      router.replace(`/search?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 검색 버튼 클릭
  const handleSearch = () => {
    executeSearch(0);
  };

  // Enter 키 핸들링
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 결과 카드 클릭
  const handleResultClick = (item: SearchResultItem) => {
    router.push(`/vod/${item.meeting_id}?t=${Math.floor(item.start_time)}`);
  };

  // 페이지 이동
  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit);
    executeSearch(newOffset);
  };

  const handleNextPage = () => {
    if (results && offset + limit < results.total) {
      executeSearch(offset + limit);
    }
  };

  // 초기 로드 시 쿼리가 있으면 자동 검색
  useEffect(() => {
    if (initialQuery) {
      executeSearch(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="통합 검색" />

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* 검색 영역 */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="검색어를 입력하세요"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-6 py-2 bg-primary text-white rounded-md font-medium hover:bg-primary-light active:bg-primary-dark transition-colors disabled:bg-gray-300"
            >
              {isLoading ? '검색 중...' : '검색'}
            </button>
          </div>

          {/* 필터 토글 버튼 */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {showFilters ? '▲ 필터 접기' : '▼ 필터 펼치기'}
          </button>

          {/* 필터 영역 */}
          {showFilters && (
            <div className="pt-3 border-t border-gray-200 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  날짜 범위
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  화자 필터
                </label>
                <input
                  type="text"
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  placeholder="화자 이름 입력 (예: 화자 1)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* 결과 영역 */}
        {results && (
          <>
            {/* 결과 요약 */}
            <div className="text-sm text-gray-600">
              <span className="font-medium">{results.total}건</span> 검색됨
            </div>

            {/* 결과 없음 */}
            {results.items.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                검색 결과가 없습니다
              </div>
            )}

            {/* 결과 목록 */}
            {results.items.length > 0 && (
              <div className="space-y-3">
                {results.items.map((item) => (
                  <div
                    key={item.subtitle_id}
                    onClick={() => handleResultClick(item)}
                    className="border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">
                        {item.meeting_title}
                      </h3>
                      <span className="text-sm text-gray-500">
                        {item.meeting_date}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-2">
                      {highlightText(item.text, query)}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      {item.speaker && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {item.speaker}
                        </span>
                      )}
                      <span>{formatTime(item.start_time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 페이지네이션 */}
            {results.items.length > 0 && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={offset + limit >= results.total}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * 검색 페이지 (Suspense wrapper)
 */
export default function SearchPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      }
    >
      <SearchPageContent />
    </React.Suspense>
  );
}
