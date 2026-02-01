// @SECURITY A05 - 환경변수 검증 적용
// @AUDIT 2026-02-01 보안 검사 시 수정

import { createClient } from '@supabase/supabase-js';
import { getClientEnv } from '@/lib/env';

// 환경변수 검증 (누락 시 명확한 에러 메시지 표시)
const env = getClientEnv();

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
