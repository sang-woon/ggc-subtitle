// @SECURITY - 환경변수 검증
// @AUDIT 2026-02-01 보안 검사 시 추가

import { z } from 'zod';

// 빌드 시점인지 확인 (Vercel 빌드 시 환경 변수가 없을 수 있음)
const isBuildTime = process.env.VERCEL_ENV === undefined && process.env.NODE_ENV === 'production';

// 서버 사이드 환경변수 스키마
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  RTZR_CLIENT_ID: z.string().optional(),
  RTZR_CLIENT_SECRET: z.string().optional(),
});

// 클라이언트 사이드 환경변수 스키마 (NEXT_PUBLIC_ 접두사)
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

// 서버 환경변수 검증 (서버 사이드에서만 호출)
export function getServerEnv() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL || '',
    RTZR_CLIENT_ID: process.env.RTZR_CLIENT_ID || '',
    RTZR_CLIENT_SECRET: process.env.RTZR_CLIENT_SECRET || '',
  };

  // 런타임에서 필수 환경 변수 체크 (빌드 시점은 건너뜀)
  if (!isBuildTime && typeof window === 'undefined') {
    const missing = [];
    if (!env.DATABASE_URL) missing.push('DATABASE_URL');
    if (!env.RTZR_CLIENT_ID) missing.push('RTZR_CLIENT_ID');
    if (!env.RTZR_CLIENT_SECRET) missing.push('RTZR_CLIENT_SECRET');

    if (missing.length > 0) {
      console.warn(`Missing environment variables: ${missing.join(', ')}`);
    }
  }

  return env;
}

// 클라이언트 환경변수 검증
export function getClientEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}

// 타입 추론용 export
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
