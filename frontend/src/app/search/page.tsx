'use client';

import { Suspense, useState, useCallback } from 'react';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

import Badge from '@/components/Badge';
import Header from '@/components/Header';
import Pagination from '@/components/Pagination';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import type { SearchGroupType } from '@/types';
import { highlightText } from '@/utils/highlight';


const PER_PAGE = 20;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** 검색 결과에서 회의 하나 */
function SearchResultGroup({
  group,
  query,
}: {
  group: SearchGroupType;
  query: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxPreview = 3;
  const displaySubs = expanded ? group.subtitles : group.subtitles.slice(0, maxPreview);
  const hasMore = group.subtitles.length > maxPreview;

  const meetingLink = group.meeting_status === 'live'
    ? `/live?channel=${group.meeting_id}`
    : group.vod_url
      ? `/vod/${group.meeting_id}`
      : `/notes/${group.meeting_id}`;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Group Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <Link
              href={meetingLink}
              className="text-base font-semibold text-gray-900 hover:text-primary transition-colors"
            >
              {group.meeting_title}
            </Link>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {group.meeting_date && <span>{formatDate(group.meeting_date)}</span>}
              <span>{group.subtitles.length}건 일치</span>
            </div>
          </div>
          {group.meeting_status === 'live' && (
            <Badge variant="live">LIVE</Badge>
          )}
        </div>
      </div>

      {/* Matching Subtitles */}
      <div className="divide-y divide-gray-50">
        {displaySubs.map((sub) => (
          <div key={sub.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono text-gray-400 mt-0.5 flex-shrink-0">
                {formatTime(sub.start_time)}
              </span>
              <p
                className="text-sm text-gray-800 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: highlightText(sub.text, query).html,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Expand/Collapse */}
      {hasMore && (
        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:text-primary-light transition-colors"
          >
            {expanded
              ? '접기'
              : `${group.subtitles.length - maxPreview}건 더 보기`}
          </button>
        </div>
      )}
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || '';

  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);

  const offset = (page - 1) * PER_PAGE;
  const { results, total, isLoading, error } = useGlobalSearch({
    query,
    limit: PER_PAGE,
    offset,
  });
  const totalPages = Math.ceil(total / PER_PAGE);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      setQuery(trimmed);
      setPage(1);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }, [inputValue, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">회의록 통합 검색</h1>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="회의록에서 검색할 키워드를 입력하세요..."
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                autoFocus
              />
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-light active:bg-primary-dark transition-colors"
            >
              검색
            </button>
          </form>
        </div>

        {/* Results */}
        {!query ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-gray-500 text-lg">검색어를 입력하여 모든 회의록을 검색하세요</p>
            <p className="text-gray-400 text-sm mt-1">회의 자막 전체에서 키워드를 검색합니다</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-red-500">검색 중 오류가 발생했습니다.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 text-lg">&quot;{query}&quot;에 대한 검색 결과가 없습니다</p>
            <p className="text-gray-400 text-sm mt-1">다른 키워드로 검색해 보세요</p>
          </div>
        ) : (
          <>
            {/* Result Summary */}
            <div className="mb-4 text-sm text-gray-500">
              &quot;{query}&quot; 검색 결과: {total}건 (회의 {results.length}개)
            </div>

            {/* Result Groups */}
            <div className="space-y-4">
              {results.map((group) => (
                <SearchResultGroup
                  key={group.meeting_id}
                  group={group}
                  query={query}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
