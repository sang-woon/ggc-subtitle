import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

// POST - feedbacks 테이블 생성
export async function POST() {
  try {
    // feedbacks 테이블 생성
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_name TEXT DEFAULT '익명',
        image_urls TEXT[],
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 인덱스 생성
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks (created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks (status)
    `);

    return NextResponse.json({ success: true, message: 'feedbacks 테이블 생성 완료' });
  } catch (error) {
    console.error('[Migrate] Error:', error);
    return NextResponse.json(
      { error: '마이그레이션 실패', details: String(error) },
      { status: 500 }
    );
  }
}
