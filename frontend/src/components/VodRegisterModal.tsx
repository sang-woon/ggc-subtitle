'use client';

import React, { useState, useEffect } from 'react';

import type { VodRegisterFormType } from '../types';

interface VodRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VodRegisterFormType) => void;
  isLoading?: boolean;
  errorMessage?: string;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function VodRegisterModal({ isOpen, onClose, onSubmit, isLoading, errorMessage }: VodRegisterModalProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setUrl('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function validate(): string {
    if (!url.trim()) {
      return 'VOD URL을 입력해주세요.';
    }
    if (!isValidUrl(url.trim())) {
      return '올바른 URL 형식을 입력해주세요.';
    }
    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    onSubmit({ url: url.trim() });
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    if (error) {
      setError('');
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-label="VOD 등록"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-xl font-semibold text-gray-900">VOD 등록</h2>
        <p className="mb-6 text-sm text-gray-500">
          KMS URL을 입력하면 제목, 날짜, 영상 정보가 자동으로 추출됩니다.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6">
            <label htmlFor="vod-url" className="mb-1 block text-sm font-medium text-gray-700">
              VOD URL
            </label>
            <input
              id="vod-url"
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="http://kms.ggc.go.kr/caster/player/vodViewer.do?midx=..."
              disabled={isLoading}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                error || errorMessage ? 'border-red-500' : 'border-gray-300'
              } ${isLoading ? 'bg-gray-100' : ''}`}
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
            {errorMessage && !error && (
              <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
