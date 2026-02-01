// @TASK T1.5 - 자막 인라인 편집 컴포넌트
// @SPEC docs/planning/06-tasks.md#t15

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SubtitleEditorProps {
  id: string;
  text: string;
  isEdited?: boolean;
  onSave: (id: string, newText: string) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

export function SubtitleEditor({
  id,
  text,
  isEdited = false,
  onSave,
  onCancel,
  className,
}: SubtitleEditorProps) {
  const [editText, setEditText] = useState(text);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 자동 포커스 및 텍스트 선택
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  // 저장 핸들러
  const handleSave = async () => {
    if (editText.trim() === '') {
      alert('자막 텍스트는 비워둘 수 없습니다.');
      return;
    }

    if (editText === text) {
      onCancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(id, editText.trim());
    } catch (error) {
      console.error('Failed to save subtitle:', error);
      alert('자막 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 키보드 이벤트 핸들러
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        rows={3}
        className={cn(
          'w-full px-3 py-2 text-sm border rounded-md resize-none',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'bg-white text-gray-900'
        )}
        placeholder="자막 텍스트를 입력하세요"
        aria-label="자막 편집"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || editText.trim() === ''}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            'bg-blue-600 text-white hover:bg-blue-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
          )}
          aria-busy={isSaving}
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>

        <button
          onClick={onCancel}
          disabled={isSaving}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            'bg-gray-200 text-gray-700 hover:bg-gray-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1'
          )}
        >
          취소
        </button>

        <span className="ml-auto text-xs text-gray-500">
          Enter: 저장 | Shift+Enter: 줄바꿈 | Esc: 취소
        </span>
      </div>

      {isEdited && (
        <p className="text-xs text-yellow-600">
          ⚠️ 이 자막은 이미 수정된 내용입니다.
        </p>
      )}
    </div>
  );
}
