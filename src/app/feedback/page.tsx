import Link from 'next/link';
import { FeedbackBoard } from '@/components/feedback/FeedbackBoard';

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            경기도의회 실시간 자막 시스템
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/search"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              자막 검색
            </Link>
            <Link
              href="/history"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              히스토리
            </Link>
            <Link
              href="/feedback"
              className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
            >
              개선 요청
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <FeedbackBoard />
      </main>
    </div>
  );
}
