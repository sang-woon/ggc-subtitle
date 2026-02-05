'use client';

import React, { useState, useEffect } from 'react';

import { VodRegisterFormType } from '../types';

interface VodRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VodRegisterFormType) => void;
}

interface FormErrors {
  title?: string;
  meeting_date?: string;
  vod_url?: string;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function VodRegisterModal({ isOpen, onClose, onSubmit }: VodRegisterModalProps) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [vodUrl, setVodUrl] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setMeetingDate('');
      setVodUrl('');
      setErrors({});
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    if (!title.trim()) {
      newErrors.title = '회의 제목을 입력해주세요.';
    } else if (title.trim().length < 2) {
      newErrors.title = '회의 제목은 2자 이상이어야 합니다.';
    }

    if (!meetingDate) {
      newErrors.meeting_date = '회의 날짜를 선택해주세요.';
    }

    if (!vodUrl.trim()) {
      newErrors.vod_url = 'VOD URL을 입력해주세요.';
    } else if (!isValidUrl(vodUrl.trim())) {
      newErrors.vod_url = '올바른 URL 형식을 입력해주세요.';
    }

    return newErrors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSubmit({
      title: title.trim(),
      meeting_date: meetingDate,
      vod_url: vodUrl.trim(),
    });
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    if (errors.title) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  }

  function handleMeetingDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMeetingDate(e.target.value);
    if (errors.meeting_date) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.meeting_date;
        return next;
      });
    }
  }

  function handleVodUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setVodUrl(e.target.value);
    if (errors.vod_url) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.vod_url;
        return next;
      });
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
        <h2 className="mb-6 text-xl font-semibold text-gray-900">VOD 등록</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="vod-title" className="mb-1 block text-sm font-medium text-gray-700">
              회의 제목
            </label>
            <input
              id="vod-title"
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="회의 제목을 입력하세요"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="vod-meeting-date" className="mb-1 block text-sm font-medium text-gray-700">
              회의 날짜
            </label>
            <input
              id="vod-meeting-date"
              type="date"
              value={meetingDate}
              onChange={handleMeetingDateChange}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.meeting_date ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.meeting_date && (
              <p className="mt-1 text-sm text-red-600">{errors.meeting_date}</p>
            )}
          </div>

          <div className="mb-6">
            <label htmlFor="vod-url" className="mb-1 block text-sm font-medium text-gray-700">
              VOD URL
            </label>
            <input
              id="vod-url"
              type="url"
              value={vodUrl}
              onChange={handleVodUrlChange}
              placeholder="https://example.com/vod/video.mp4"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.vod_url ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.vod_url && (
              <p className="mt-1 text-sm text-red-600">{errors.vod_url}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 transition-colors"
            >
              등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
