'use client';

import React, { useState } from 'react';

import {
  applyGrammarCorrections,
  applyTerminology,
  checkGrammar,
  checkTerminology,
} from '../lib/api';

import type {
  GrammarCheckResult,
  GrammarIssue,
  TermCheckResult,
} from '../lib/api';

interface ProofreadingToolbarProps {
  meetingId: string;
  onCorrectionsApplied?: () => void;
}

export default function ProofreadingToolbar({
  meetingId,
  onCorrectionsApplied,
}: ProofreadingToolbarProps) {
  // Terminology state
  const [termLoading, setTermLoading] = useState(false);
  const [termApplying, setTermApplying] = useState(false);
  const [termResult, setTermResult] = useState<TermCheckResult | null>(null);
  const [showTermResult, setShowTermResult] = useState(false);

  // Grammar state
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarApplying, setGrammarApplying] = useState(false);
  const [grammarResult, setGrammarResult] = useState<GrammarCheckResult | null>(null);
  const [showGrammarResult, setShowGrammarResult] = useState(false);
  const [selectedCorrections, setSelectedCorrections] = useState<Set<string>>(new Set());

  // ─── Terminology ───

  const handleTermCheck = async () => {
    try {
      setTermLoading(true);
      const result = await checkTerminology(meetingId);
      setTermResult(result);
      setShowTermResult(true);
    } catch {
      alert('용어 점검에 실패했습니다.');
    } finally {
      setTermLoading(false);
    }
  };

  const handleTermApply = async () => {
    if (!termResult || termResult.total_issues === 0) return;

    const confirmed = window.confirm(
      `${termResult.total_issues}건의 용어 표기를 일괄 교정합니다. 계속하시겠습니까?`
    );
    if (!confirmed) return;

    try {
      setTermApplying(true);
      const result = await applyTerminology(meetingId);
      alert(`${result.updated}건 교정 완료`);
      setShowTermResult(false);
      setTermResult(null);
      onCorrectionsApplied?.();
    } catch {
      alert('용어 교정 적용에 실패했습니다.');
    } finally {
      setTermApplying(false);
    }
  };

  // ─── Grammar ───

  const handleGrammarCheck = async () => {
    try {
      setGrammarLoading(true);
      const result = await checkGrammar(meetingId);
      setGrammarResult(result);
      setShowGrammarResult(true);
      // Select all by default
      const allIds = new Set(result.issues.map((i) => i.subtitle_id));
      setSelectedCorrections(allIds);
    } catch {
      alert('AI 문장 검사에 실패했습니다. (API 키 확인 필요)');
    } finally {
      setGrammarLoading(false);
    }
  };

  const toggleGrammarSelection = (subtitleId: string) => {
    setSelectedCorrections((prev) => {
      const next = new Set(prev);
      if (next.has(subtitleId)) {
        next.delete(subtitleId);
      } else {
        next.add(subtitleId);
      }
      return next;
    });
  };

  const handleGrammarApply = async () => {
    if (!grammarResult || selectedCorrections.size === 0) return;

    const corrections = grammarResult.issues
      .filter((i) => selectedCorrections.has(i.subtitle_id))
      .map((i) => ({
        subtitle_id: i.subtitle_id,
        corrected_text: i.corrected_text,
      }));

    try {
      setGrammarApplying(true);
      const result = await applyGrammarCorrections(meetingId, corrections);
      alert(`${result.updated}건 교정 완료`);
      setShowGrammarResult(false);
      setGrammarResult(null);
      setSelectedCorrections(new Set());
      onCorrectionsApplied?.();
    } catch {
      alert('문장 교정 적용에 실패했습니다.');
    } finally {
      setGrammarApplying(false);
    }
  };

  return (
    <div data-testid="proofreading-toolbar" className="space-y-2">
      {/* 용어 점검 */}
      <button
        data-testid="term-check-button"
        onClick={handleTermCheck}
        disabled={termLoading || termApplying}
        className="w-full py-2 px-4 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {termLoading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            점검 중...
          </span>
        ) : (
          '용어 표기 점검'
        )}
      </button>

      {showTermResult && termResult && (
        <div className="p-3 bg-white border border-blue-200 rounded-md">
          {termResult.total_issues === 0 ? (
            <p className="text-sm text-green-600">용어 표기 문제가 없습니다.</p>
          ) : (
            <>
              <p className="text-sm text-blue-700 font-medium mb-2">
                {termResult.total_issues}건의 용어 표기 불일치
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                {termResult.issues.map((issue, idx) => (
                  <div key={idx} className="text-xs bg-blue-50 p-2 rounded flex items-center gap-1">
                    <span className="text-red-600 line-through">{issue.wrong_term}</span>
                    <span className="text-gray-400">&rarr;</span>
                    <span className="text-green-600 font-medium">{issue.correct_term}</span>
                    {issue.category && (
                      <span className="ml-auto text-gray-400">[{issue.category}]</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  data-testid="term-apply-button"
                  onClick={handleTermApply}
                  disabled={termApplying}
                  className="flex-1 py-1.5 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {termApplying ? '적용 중...' : '일괄 교정'}
                </button>
                <button
                  onClick={() => setShowTermResult(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* AI 문장 검사 */}
      <button
        data-testid="grammar-check-button"
        onClick={handleGrammarCheck}
        disabled={grammarLoading || grammarApplying}
        className="w-full py-2 px-4 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {grammarLoading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            AI 검사 중...
          </span>
        ) : (
          'AI 문장 검사'
        )}
      </button>

      {showGrammarResult && grammarResult && (
        <div className="p-3 bg-white border border-purple-200 rounded-md">
          {grammarResult.total_issues === 0 ? (
            <p className="text-sm text-green-600">교정이 필요한 문장이 없습니다.</p>
          ) : (
            <>
              <p className="text-sm text-purple-700 font-medium mb-2">
                {grammarResult.total_issues}건 교정 제안 ({selectedCorrections.size}건 선택)
              </p>
              <div className="max-h-60 overflow-y-auto space-y-2 mb-2">
                {grammarResult.issues.map((issue: GrammarIssue) => (
                  <label
                    key={issue.subtitle_id}
                    className={`block text-xs p-2 rounded cursor-pointer border transition-colors ${
                      selectedCorrections.has(issue.subtitle_id)
                        ? 'bg-purple-50 border-purple-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedCorrections.has(issue.subtitle_id)}
                        onChange={() => toggleGrammarSelection(issue.subtitle_id)}
                        className="mt-0.5 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-red-600 line-through break-words">
                          {issue.original_text}
                        </div>
                        <div className="text-green-600 font-medium break-words mt-0.5">
                          {issue.corrected_text}
                        </div>
                        {issue.changes.length > 0 && (
                          <div className="text-gray-400 mt-0.5">
                            {issue.changes.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  data-testid="grammar-apply-button"
                  onClick={handleGrammarApply}
                  disabled={grammarApplying || selectedCorrections.size === 0}
                  className="flex-1 py-1.5 text-sm font-medium text-white bg-purple-500 rounded-md hover:bg-purple-600 disabled:opacity-50"
                >
                  {grammarApplying
                    ? '적용 중...'
                    : `선택 항목 적용 (${selectedCorrections.size}건)`}
                </button>
                <button
                  onClick={() => setShowGrammarResult(false)}
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
