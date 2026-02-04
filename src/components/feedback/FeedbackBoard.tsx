'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RefreshCw, MessageSquarePlus } from 'lucide-react';
import { FeedbackForm } from './FeedbackForm';
import { FeedbackItem } from './FeedbackItem';
import type { Feedback } from '@/db/schema';

export function FeedbackBoard() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const fetchFeedbacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/feedback');
      if (!response.ok) throw new Error('목록을 불러올 수 없습니다');
      const data = await response.json();
      setFeedbacks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleSubmit = async (feedback: {
    title: string;
    content: string;
    authorName: string;
    imageUrls: string[];
  }) => {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '등록에 실패했습니다');
    }

    setShowForm(false);
    openButtonRef.current?.focus();
    fetchFeedbacks();
  };

  const handleCloseModal = useCallback(() => {
    setShowForm(false);
    openButtonRef.current?.focus();
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!showForm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showForm, handleCloseModal]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">개선 요청 게시판</h2>
          <p className="text-sm text-gray-500 mt-1">
            서비스 개선 사항이나 버그를 알려주세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFeedbacks}
            aria-label="새로고침"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            ref={openButtonRef}
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            새 글 작성
          </button>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* 작성 폼 모달 */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-form-title"
        >
          <div
            ref={modalRef}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <FeedbackForm
              onSubmit={handleSubmit}
              onCancel={handleCloseModal}
            />
          </div>
        </div>
      )}

      {/* 피드백 목록 */}
      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <p className="mt-2 text-gray-500">불러오는 중...</p>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <MessageSquarePlus className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-4 text-gray-500">아직 등록된 개선 요청이 없습니다</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            첫 번째 글을 작성해보세요
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((feedback) => (
            <FeedbackItem key={feedback.id} feedback={feedback} />
          ))}
        </div>
      )}
    </div>
  );
}
