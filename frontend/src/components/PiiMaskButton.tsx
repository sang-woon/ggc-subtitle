'use client';

import React, { useState } from 'react';

import { applyPiiMask, detectPii } from '../lib/api';

import type { PiiDetectResult } from '../lib/api';

interface PiiMaskButtonProps {
  meetingId: string;
  onMaskApplied?: () => void;
}

export default function PiiMaskButton({ meetingId, onMaskApplied }: PiiMaskButtonProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [detectResult, setDetectResult] = useState<PiiDetectResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleDetect = async () => {
    try {
      setIsDetecting(true);
      const result = await detectPii(meetingId);
      setDetectResult(result);
      setShowResult(true);
    } catch {
      alert('PII 감지에 실패했습니다.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleApply = async () => {
    if (!detectResult || detectResult.total_pii_count === 0) return;

    const confirmed = window.confirm(
      `${detectResult.total_pii_count}건의 개인정보를 마스킹합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`
    );
    if (!confirmed) return;

    try {
      setIsApplying(true);
      const subtitleIds = detectResult.items.map((item) => item.id);
      await applyPiiMask(meetingId, subtitleIds);
      setShowResult(false);
      setDetectResult(null);
      onMaskApplied?.();
    } catch {
      alert('PII 마스킹 적용에 실패했습니다.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div data-testid="pii-mask-button">
      <button
        onClick={handleDetect}
        disabled={isDetecting || isApplying}
        className="w-full py-2 px-4 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDetecting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            감지 중...
          </span>
        ) : (
          '개인정보 감지 / 마스킹'
        )}
      </button>

      {/* 감지 결과 */}
      {showResult && detectResult && (
        <div className="mt-2 p-3 bg-white border border-orange-200 rounded-md">
          {detectResult.total_pii_count === 0 ? (
            <p className="text-sm text-green-600">개인정보가 감지되지 않았습니다.</p>
          ) : (
            <>
              <p className="text-sm text-orange-700 font-medium mb-2">
                {detectResult.items.length}개 자막에서{' '}
                {detectResult.total_pii_count}건의 개인정보가 감지되었습니다.
              </p>

              <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                {detectResult.items.map((item) => (
                  <div key={item.id} className="text-xs bg-orange-50 p-2 rounded">
                    {item.pii_found.map((pii, idx) => (
                      <span key={idx} className="inline-flex items-center mr-2">
                        <span className="text-red-600 line-through">{pii.original}</span>
                        <span className="mx-1 text-gray-400">&rarr;</span>
                        <span className="text-green-600">{pii.masked}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="flex-1 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  {isApplying ? '적용 중...' : '일괄 마스킹 적용'}
                </button>
                <button
                  onClick={() => setShowResult(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
