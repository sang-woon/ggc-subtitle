import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { subtitles, videoSessions } from '@/db/schema';
import { eq, desc, like } from 'drizzle-orm';

// 자막 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, startTimeMs, endTimeMs, text, confidence, seq } = body;

    if (!sessionId || startTimeMs === undefined || !text) {
      return NextResponse.json(
        { error: 'sessionId, startTimeMs, and text are required' },
        { status: 400 }
      );
    }

    const [newSubtitle] = await db
      .insert(subtitles)
      .values({
        sessionId,
        startTimeMs,
        endTimeMs: endTimeMs || startTimeMs + 3000,
        text,
        confidence,
        seq,
      })
      .returning();

    return NextResponse.json({ subtitle: newSubtitle });
  } catch (error) {
    console.error('Failed to save subtitle:', error);
    return NextResponse.json(
      { error: 'Failed to save subtitle' },
      { status: 500 }
    );
  }
}

// 자막 검색/조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 특정 세션의 자막 조회
    if (sessionId) {
      const sessionSubtitles = await db
        .select()
        .from(subtitles)
        .where(eq(subtitles.sessionId, sessionId))
        .orderBy(subtitles.startTimeMs)
        .limit(limit)
        .offset(offset);

      return NextResponse.json({ subtitles: sessionSubtitles });
    }

    // 검색어로 자막 검색
    if (query) {
      const searchResults = await db
        .select({
          id: subtitles.id,
          sessionId: subtitles.sessionId,
          startTimeMs: subtitles.startTimeMs,
          endTimeMs: subtitles.endTimeMs,
          text: subtitles.text,
          session: {
            id: videoSessions.id,
            kmsUrl: videoSessions.kmsUrl,
            title: videoSessions.title,
            startedAt: videoSessions.startedAt,
          },
        })
        .from(subtitles)
        .leftJoin(videoSessions, eq(subtitles.sessionId, videoSessions.id))
        .where(like(subtitles.text, `%${query}%`))
        .orderBy(desc(subtitles.createdAt))
        .limit(limit)
        .offset(offset);

      return NextResponse.json({
        results: searchResults,
        query,
      });
    }

    return NextResponse.json(
      { error: 'sessionId or q parameter is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to fetch subtitles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subtitles' },
      { status: 500 }
    );
  }
}
