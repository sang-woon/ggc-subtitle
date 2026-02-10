'use client';

import { useState } from 'react';

import Link from 'next/link';

import { Header, LiveMeetingCard, RecentVodList, VodRegisterModal } from '@/components';
import { useLiveMeeting, useRecentVods } from '@/hooks';
import { apiClient, ApiError } from '@/lib/api';
import type { VodRegisterFormType, MeetingType } from '@/types';

export default function Home() {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // API 연동 훅 사용
  const { meeting: liveMeeting, isLoading: isLiveLoading, error: liveError } = useLiveMeeting();
  const { vods: recentVods, isLoading: isVodsLoading, error: vodsError, mutate: refreshVods } = useRecentVods({ limit: 5 });

  const handleRegisterClick = () => {
    setRegisterError('');
    setIsRegisterModalOpen(true);
  };

  const handleRegisterSubmit = async (data: VodRegisterFormType) => {
    setRegisterLoading(true);
    setRegisterError('');
    try {
      await apiClient<MeetingType>('/api/meetings/from-url', {
        method: 'POST',
        body: JSON.stringify({ url: data.url }),
      });
      setIsRegisterModalOpen(false);
      refreshVods();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRegisterError('이미 등록된 VOD입니다.');
      } else if (err instanceof ApiError && err.status === 422) {
        setRegisterError('URL에서 영상 정보를 추출할 수 없습니다.');
      } else {
        setRegisterError('VOD 등록에 실패했습니다.');
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showRegisterButton onRegisterClick={handleRegisterClick} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">경기도의회 실시간 자막 서비스</h1>

        <div className="space-y-6">
          {/* Live Meeting Section */}
          {isLiveLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">실시간 회의</h2>
              <div className="py-8 text-center text-gray-500">로딩 중...</div>
            </div>
          ) : liveError ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">실시간 회의</h2>
              <div className="py-8 text-center text-red-500">
                데이터를 불러오는 중 오류가 발생했습니다.
              </div>
            </div>
          ) : (
            <LiveMeetingCard meeting={liveMeeting} />
          )}

          {/* Recent VODs Section */}
          {isVodsLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 회의</h2>
              <div className="py-8 text-center text-gray-500">로딩 중...</div>
            </div>
          ) : vodsError ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 회의</h2>
              <div className="py-8 text-center text-red-500">
                데이터를 불러오는 중 오류가 발생했습니다.
              </div>
            </div>
          ) : (
            <RecentVodList vods={recentVods} />
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Link
              href="/live"
              className="flex-1 px-4 py-3 bg-primary text-white rounded-md font-medium text-center hover:bg-primary-light active:bg-primary-dark transition-colors"
            >
              채널 선택
            </Link>
            <Link
              href="/vod"
              className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-md font-medium text-center hover:bg-gray-50 transition-colors"
            >
              VOD 전체보기
            </Link>
            <button
              onClick={handleRegisterClick}
              className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
            >
              VOD 등록
            </button>
          </div>
        </div>
      </main>

      <VodRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSubmit={handleRegisterSubmit}
        isLoading={registerLoading}
        errorMessage={registerError}
      />
    </div>
  );
}
