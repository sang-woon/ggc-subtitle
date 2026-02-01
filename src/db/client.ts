// @SECURITY A05 - 환경변수 검증 적용
// @AUDIT 2026-02-01 보안 검사 시 수정

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getServerEnv } from '@/lib/env';

// 환경변수 검증 (서버 시작 시 실패하면 명확한 에러 메시지 표시)
const env = getServerEnv();
const connectionString = env.DATABASE_URL;

// 개발 환경에서는 싱글톤 패턴 사용
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(connectionString);

if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
