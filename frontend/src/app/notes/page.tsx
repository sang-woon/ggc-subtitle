'use client';

import { useState, useMemo } from 'react';

import Header from '@/components/Header';
import MeetingNoteCard from '@/components/MeetingNoteCard';
import Pagination from '@/components/Pagination';
import { useMeetingNotes } from '@/hooks/useMeetingNotes';
import type { MeetingNoteType } from '@/types';

/** 날짜별 그룹핑 헬퍼 */
function groupByDate(
  notes: MeetingNoteType[]
): Map<string, MeetingNoteType[]> {
  const map = new Map<string, MeetingNoteType[]>();
  for (const note of notes) {
    const key = note.meeting_date;
    const arr = map.get(key) ?? [];
    arr.push(note);
    map.set(key, arr);
  }
  return map;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return '오늘';
  if (d.toDateString() === yesterday.toDateString()) return '어제';

  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export default function NotesPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const { notes, isLoading, error, total, totalPages } = useMeetingNotes({
    page: currentPage,
    perPage: 20,
  });

  const groupedNotes = useMemo(() => groupByDate(notes), [notes]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">회의록</h1>
          <p className="text-sm text-gray-500 mt-1">
            경기도의회 회의 기록을 확인하세요
            {total > 0 && <span className="ml-2">({total}건)</span>}
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-red-500">데이터를 불러오는 중 오류가 발생했습니다.</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-lg mb-1">아직 회의록이 없습니다</p>
            <p className="text-gray-400 text-sm">실시간 방송 또는 VOD 등록을 통해 회의록이 생성됩니다</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(groupedNotes.entries()).map(([dateKey, dateNotes]) => (
              <section key={dateKey}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pl-1">
                  {formatDateHeading(dateKey)}
                </h2>
                <div className="space-y-3">
                  {dateNotes.map((note) => (
                    <MeetingNoteCard key={note.id} note={note} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </main>
    </div>
  );
}
