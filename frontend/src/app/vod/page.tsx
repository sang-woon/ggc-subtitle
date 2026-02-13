'use client';

import { useState } from 'react';

import Pagination from '@/components/Pagination';
import VodTable from '@/components/VodTable';
import { useVodList } from '@/hooks/useVodList';

export default function VodListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const { vods, isLoading, error, totalPages } = useVodList({ page: currentPage });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">VOD 목록</h1>

        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="py-8 text-center text-gray-500">로딩 중...</div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="py-8 text-center text-red-500">
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <VodTable vods={vods} />

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
