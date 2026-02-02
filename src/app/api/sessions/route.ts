import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { videoSessions, subtitles } from '@/db/schema';
import { eq, desc, count } from 'drizzle-orm';

// 세션 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kmsUrl, midx, title, isLive = false } = body;

    if (!kmsUrl || !midx) {
      return NextResponse.json(
        { error: 'kmsUrl and midx are required' },
        { status: 400 }
      );
    }

    // 기존 세션 확인
    const existingSession = await db
      .select()
      .from(videoSessions)
      .where(eq(videoSessions.midx, midx))
      .limit(1);

    if (existingSession.length > 0) {
      // 해당 세션의 자막 개수 확인
      const subtitleCount = await db
        .select({ count: count() })
        .from(subtitles)
        .where(eq(subtitles.sessionId, existingSession[0].id));

      return NextResponse.json({
        session: existingSession[0],
        isExisting: true,
        subtitleCount: subtitleCount[0]?.count || 0,
      });
    }

    // 새 세션 생성
    const [newSession] = await db
      .insert(videoSessions)
      .values({
        kmsUrl,
        midx,
        title,
        isLive,
        startedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      session: newSession,
      isExisting: false,
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

// 세션 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const sessions = await db
      .select()
      .from(videoSessions)
      .orderBy(desc(videoSessions.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
