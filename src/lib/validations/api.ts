// @SECURITY A03 - API 입력 검증 스키마
// @AUDIT 2026-02-01 보안 검사 시 추가

import { z } from 'zod';

// 자막 생성 스키마
export const createSubtitleSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  startTimeMs: z.number().int().min(0, 'startTimeMs must be non-negative'),
  endTimeMs: z.number().int().min(0, 'endTimeMs must be non-negative'),
  text: z
    .string()
    .min(1, 'text is required')
    .max(2000, 'text must be less than 2000 characters'),
  confidence: z.number().min(0).max(1).optional(),
  seq: z.number().int().optional(),
});

// 자막 수정 스키마
export const updateSubtitleSchema = z.object({
  text: z
    .string()
    .min(1, 'text is required')
    .max(2000, 'text must be less than 2000 characters'),
});

// 세션 생성 스키마
export const createSessionSchema = z.object({
  kmsUrl: z
    .string()
    .url('kmsUrl must be a valid URL')
    .refine(
      (url) => url.includes('kms.ggc.go.kr'),
      'kmsUrl must be a valid KMS URL'
    ),
  midx: z.number().int().positive('midx must be a positive integer'),
  title: z.string().max(500).optional(),
  isLive: z.boolean().optional(),
});

// 자막 배치 저장 스키마
export const batchSubtitlesSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  subtitles: z
    .array(
      z.object({
        startTimeMs: z.number().int().min(0),
        endTimeMs: z.number().int().min(0).optional(),
        text: z.string().min(1).max(2000),
        confidence: z.number().min(0).max(1).optional(),
        seq: z.number().int().optional(),
      })
    )
    .min(1, 'subtitles array must have at least one item')
    .max(100, 'subtitles array must have at most 100 items'),
});

// 검색 쿼리 스키마
export const searchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'search query is required')
    .max(200, 'search query must be less than 200 characters'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// 페이지네이션 스키마
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// 에러 응답 헬퍼
export function createValidationError(error: z.ZodError) {
  const messages = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  return {
    error: 'Validation failed',
    details: messages,
  };
}

// 타입 추론용 export
export type CreateSubtitleInput = z.infer<typeof createSubtitleSchema>;
export type UpdateSubtitleInput = z.infer<typeof updateSubtitleSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type BatchSubtitlesInput = z.infer<typeof batchSubtitlesSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
