'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2, ImagePlus } from 'lucide-react';

interface FeedbackFormProps {
  onSubmit: (feedback: {
    title: string;
    content: string;
    authorName: string;
    imageUrls: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

export function FeedbackForm({ onSubmit, onCancel }: FeedbackFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 업로드 공통 함수
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setError('이미지 파일만 업로드 가능합니다');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const uploadPromises = imageFiles.map(async (file) => {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`${file.name}: 파일 크기는 5MB 이하여야 합니다`);
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/feedback/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || '업로드 실패');
        }

        const data = await response.json();
        return data.url;
      });

      const urls = await Promise.all(uploadPromises);
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  }, [uploadFiles]);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 입력해주세요');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        authorName: authorName.trim() || '익명',
        imageUrls: images,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6">
      <h2 id="feedback-form-title" className="text-xl font-bold mb-4">개선 요청 작성</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="authorName" className="block text-sm font-medium text-gray-700 mb-1">
            작성자 (선택)
          </label>
          <input
            id="authorName"
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="익명"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="개선 요청 제목을 입력하세요"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
            내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="개선이 필요한 사항을 자세히 작성해주세요"
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            이미지 첨부 (선택)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* 드래그 앤 드롭 영역 */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
              transition-colors
              ${isDragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }
              ${isUploading ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-600">업로드 중...</p>
              </div>
            ) : isDragActive ? (
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="w-8 h-8 text-blue-500" />
                <p className="text-sm text-blue-600 font-medium">여기에 놓으세요</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm text-gray-600">
                  <span className="text-blue-600 font-medium">클릭</span>하거나{' '}
                  <span className="text-blue-600 font-medium">드래그</span>하여 이미지 업로드
                </p>
                <p className="text-xs text-gray-400">PNG, JPG, GIF (최대 5MB)</p>
              </div>
            )}
          </div>

          {images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((url, index) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt={`첨부 이미지 ${index + 1}`}
                    width={80}
                    height={80}
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    aria-label={`이미지 ${index + 1} 삭제`}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          등록하기
        </button>
      </div>
    </form>
  );
}
