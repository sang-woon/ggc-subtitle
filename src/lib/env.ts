// @SECURITY - 환경변수 검증
// @AUDIT 2026-02-01 보안 검사 시 추가

import { z } from 'zod';

// 서버 사이드 환경변수 스키마
const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string'
    ),
  RTZR_CLIENT_ID: z.string().min(1, 'RTZR_CLIENT_ID is required'),
  RTZR_CLIENT_SECRET: z.string().min(1, 'RTZR_CLIENT_SECRET is required'),
});

// 클라이언트 사이드 환경변수 스키마 (NEXT_PUBLIC_ 접두사)
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
});

// 서버 환경변수 검증 (서버 사이드에서만 호출)
export function getServerEnv() {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    RTZR_CLIENT_ID: process.env.RTZR_CLIENT_ID,
    RTZR_CLIENT_SECRET: process.env.RTZR_CLIENT_SECRET,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Server environment validation failed:\n${errors}`);
  }

  return result.data;
}

// 클라이언트 환경변수 검증
export function getClientEnv() {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Client environment validation failed:\n${errors}`);
  }

  return result.data;
}

// 타입 추론용 export
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
