'use client';

import React, { useState, useEffect } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { getBills, getBill } from '@/lib/api';
import type { BillDetail, BillMention, BillsResponse } from '@/types';

/**
 * 상태 레이블 매핑
 */
const STATUS_LABELS: Record<string, string> = {
  received: '접수',
  reviewing: '심사중',
  decided: '의결',
  promulgated: '공포',
};

/**
 * 상태별 색상
 */
const STATUS_COLORS: Record<string, string> = {
  received: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  decided: 'bg-green-100 text-green-700',
  promulgated: 'bg-purple-100 text-purple-700',
};

/**
 * 날짜 포맷 (YYYY-MM-DD)
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    const isoDate = date.toISOString().split('T')[0];
    return isoDate || dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * 시간 포맷 (초 → MM:SS)
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 의안 관리 페이지 컨텐츠 (Suspense 내부)
 */
function BillsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 쿼리에서 초기값 추출
  const initialQ = searchParams.get('q') || '';
  const initialCommittee = searchParams.get('committee') || '';
  const initialStatus = searchParams.get('status') || '';

  // 상태
  const [q, setQ] = useState(initialQ);
  const [committee, setCommittee] = useState(initialCommittee);
  const [status, setStatus] = useState(initialStatus);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<BillsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [billDetails, setBillDetails] = useState<Record<string, BillDetail>>(
    {}
  );
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const limit = 20;

  // 의안 목록 조회
  const fetchBills = async (newOffset = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      const params: {
        q?: string;
        committee?: string;
        status?: 'received' | 'reviewing' | 'decided' | 'promulgated';
        limit: number;
        offset: number;
      } = {
        limit,
        offset: newOffset,
      };
      if (q) params.q = q;
      if (committee) params.committee = committee;
      if (status)
        params.status = status as
          | 'received'
          | 'reviewing'
          | 'decided'
          | 'promulgated';

      const data = await getBills(params);
      setResponse(data);
      setOffset(newOffset);

      // URL 업데이트
      const urlParams = new URLSearchParams();
      if (q) urlParams.set('q', q);
      if (committee) urlParams.set('committee', committee);
      if (status) urlParams.set('status', status);
      if (urlParams.toString()) {
        router.replace(`/bills?${urlParams.toString()}`);
      } else {
        router.replace('/bills');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 중 오류가 발생했습니다');
      setResponse(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 검색 버튼 클릭
  const handleSearch = () => {
    fetchBills(0);
  };

  // Enter 키 핸들링
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 페이지 이동
  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit);
    fetchBills(newOffset);
  };

  const handleNextPage = () => {
    if (response && offset + limit < response.total) {
      fetchBills(offset + limit);
    }
  };

  // 의안 클릭 - 상세 정보 펼치기/접기
  const handleBillClick = async (billId: string) => {
    if (expandedBillId === billId) {
      // 이미 펼쳐진 경우 접기
      setExpandedBillId(null);
      return;
    }

    // 펼치기
    setExpandedBillId(billId);

    // 상세 정보가 아직 로드되지 않았으면 로드
    if (!billDetails[billId]) {
      setLoadingDetail(billId);
      try {
        const detail = await getBill(billId);
        setBillDetails((prev) => ({ ...prev, [billId]: detail }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : '상세 정보 조회 중 오류 발생'
        );
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  // 회의 언급 클릭 - VOD 페이지로 이동
  const handleMentionClick = (mention: BillMention) => {
    if (mention.start_time !== null) {
      router.push(`/vod/${mention.meeting_id}?t=${Math.floor(mention.start_time)}`);
    } else {
      router.push(`/vod/${mention.meeting_id}`);
    }
  };

  // 초기 로드
  useEffect(() => {
    fetchBills(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* 검색/필터 영역 */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="의안명 검색"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-6 py-2 bg-primary text-white rounded-md font-medium hover:bg-primary-light active:bg-primary-dark transition-colors disabled:bg-gray-300"
            >
              {isLoading ? '조회 중...' : '검색'}
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
            <div className="pt-3 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  위원회
                </label>
                <input
                  type="text"
                  value={committee}
                  onChange={(e) => setCommittee(e.target.value)}
                  placeholder="위원회명 입력"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상태
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">전체</option>
                  <option value="received">접수</option>
                  <option value="reviewing">심사중</option>
                  <option value="decided">의결</option>
                  <option value="promulgated">공포</option>
                </select>
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
        {response && (
          <>
            {/* 결과 요약 */}
            <div className="text-sm text-gray-600">
              <span className="font-medium">{response.total}건</span> 조회됨
            </div>

            {/* 결과 없음 */}
            {response.items.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                조회 결과가 없습니다
              </div>
            )}

            {/* 결과 테이블 (데스크톱) */}
            {response.items.length > 0 && (
              <div className="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        의안번호
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        의안명
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        제안자
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        위원회
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        상태
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        제안일
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {response.items.map((bill) => (
                      <React.Fragment key={bill.id}>
                        <tr
                          onClick={() => handleBillClick(bill.id)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {bill.bill_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {bill.title}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {bill.proposer || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {bill.committee || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[bill.status]}`}
                            >
                              {STATUS_LABELS[bill.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(bill.proposed_date)}
                          </td>
                        </tr>
                        {/* 펼쳐진 상세 정보 */}
                        {expandedBillId === bill.id && (() => {
                          const detail = billDetails[bill.id];
                          return (
                            <tr>
                              <td colSpan={6} className="px-4 py-3 bg-gray-50">
                                {loadingDetail === bill.id ? (
                                  <div className="text-sm text-gray-500">
                                    로딩 중...
                                  </div>
                                ) : detail ? (
                                  <div className="space-y-2">
                                    <h4 className="text-sm font-semibold text-gray-900">
                                      관련 회의
                                    </h4>
                                    {detail.mentions.length === 0 ? (
                                      <p className="text-sm text-gray-500">
                                        관련 회의가 없습니다
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {detail.mentions.map(
                                          (mention) => (
                                            <div
                                              key={mention.id}
                                              onClick={() =>
                                                handleMentionClick(mention)
                                              }
                                              className="bg-white border border-gray-200 rounded-md p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                                            >
                                              <div className="flex items-center justify-between mb-1">
                                                <h5 className="text-sm font-medium text-gray-900">
                                                  {mention.meeting_title || '제목 없음'}
                                                </h5>
                                                <span className="text-xs text-gray-500">
                                                  {formatDate(mention.meeting_date || null)}
                                                </span>
                                              </div>
                                              {mention.start_time !== null && (
                                                <div className="text-xs text-gray-600">
                                                  시간:{' '}
                                                  {formatTime(mention.start_time)}
                                                  {mention.end_time !== null &&
                                                    ` ~ ${formatTime(mention.end_time)}`}
                                                </div>
                                              )}
                                              {mention.note && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                  {mention.note}
                                                </p>
                                              )}
                                            </div>
                                          )
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 결과 카드 (모바일) */}
            {response.items.length > 0 && (
              <div className="md:hidden space-y-3">
                {response.items.map((bill) => (
                  <div key={bill.id} className="bg-white rounded-lg shadow-sm">
                    <div
                      onClick={() => handleBillClick(bill.id)}
                      className="p-4 space-y-2 cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 flex-1">
                          {bill.title}
                        </h3>
                        <span
                          className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bill.status]}`}
                        >
                          {STATUS_LABELS[bill.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>의안번호: {bill.bill_number}</div>
                        {bill.proposer && <div>제안자: {bill.proposer}</div>}
                        {bill.committee && (
                          <div>위원회: {bill.committee}</div>
                        )}
                        <div>제안일: {formatDate(bill.proposed_date)}</div>
                      </div>
                    </div>

                    {/* 펼쳐진 상세 정보 (모바일) */}
                    {expandedBillId === bill.id && (() => {
                      const detail = billDetails[bill.id];
                      return (
                        <div className="border-t border-gray-200 p-4 bg-gray-50">
                          {loadingDetail === bill.id ? (
                            <div className="text-sm text-gray-500">
                              로딩 중...
                            </div>
                          ) : detail ? (
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-900">
                                관련 회의
                              </h4>
                              {detail.mentions.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                  관련 회의가 없습니다
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {detail.mentions.map(
                                    (mention) => (
                                      <div
                                        key={mention.id}
                                        onClick={() =>
                                          handleMentionClick(mention)
                                        }
                                        className="bg-white border border-gray-200 rounded-md p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <h5 className="text-sm font-medium text-gray-900">
                                            {mention.meeting_title || '제목 없음'}
                                          </h5>
                                          <span className="text-xs text-gray-500">
                                            {formatDate(mention.meeting_date || null)}
                                          </span>
                                        </div>
                                        {mention.start_time !== null && (
                                          <div className="text-xs text-gray-600">
                                            시간: {formatTime(mention.start_time)}
                                            {mention.end_time !== null &&
                                              ` ~ ${formatTime(mention.end_time)}`}
                                          </div>
                                        )}
                                        {mention.note && (
                                          <p className="text-xs text-gray-600 mt-1">
                                            {mention.note}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}

            {/* 페이지네이션 */}
            {response.items.length > 0 && (
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
                  disabled={offset + limit >= response.total}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 의안 관리 페이지 (Suspense wrapper)
 */
export default function BillsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      }
    >
      <BillsPageContent />
    </React.Suspense>
  );
}
