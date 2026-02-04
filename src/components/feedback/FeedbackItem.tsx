'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, User } from 'lucide-react';
import type { Feedback } from '@/db/schema';

interface FeedbackItemProps {
  feedback: Feedback;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
};

const statusLabels = {
  pending: '검토 대기',
  reviewed: '검토 중',
  resolved: '해결됨',
};

export function FeedbackItem({ feedback }: FeedbackItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const status = (feedback.status || 'pending') as keyof typeof statusColors;

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-[box-shadow]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full p-4 text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status]}`}
              >
                {statusLabels[status]}
              </span>
              {feedback.imageUrls && feedback.imageUrls.length > 0 && (
                <span className="text-xs text-gray-500">
                  {feedback.imageUrls.length}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 truncate">
              {feedback.title}
            </h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {feedback.authorName || '익명'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(feedback.createdAt)}
              </span>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-4">
            <p className="text-gray-700 whitespace-pre-wrap">{feedback.content}</p>

            {feedback.imageUrls && feedback.imageUrls.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">첨부 이미지</p>
                <div className="flex flex-wrap gap-2">
                  {feedback.imageUrls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg"
                    >
                      <img
                        src={url}
                        alt={`첨부 이미지 ${index + 1}`}
                        width={128}
                        height={128}
                        className="w-32 h-32 object-cover rounded-lg border hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
