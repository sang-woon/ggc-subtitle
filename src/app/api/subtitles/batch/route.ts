import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { subtitles } from '@/db/schema';

// 자막 일괄 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, subtitles: subtitleList } = body;

    if (!sessionId || !Array.isArray(subtitleList) || subtitleList.length === 0) {
      return NextResponse.json(
        { error: 'sessionId and subtitles array are required' },
        { status: 400 }
      );
    }

    const subtitlesToInsert = subtitleList.map((s, index) => ({
      sessionId,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs || s.startTimeMs + 3000,
      text: s.text,
      confidence: s.confidence,
      seq: s.seq ?? index,
    }));

    const insertedSubtitles = await db
      .insert(subtitles)
      .values(subtitlesToInsert)
      .returning();

    return NextResponse.json({
      count: insertedSubtitles.length,
      subtitles: insertedSubtitles,
    });
  } catch (error) {
    console.error('Failed to batch save subtitles:', error);
    return NextResponse.json(
      { error: 'Failed to batch save subtitles' },
      { status: 500 }
    );
  }
}
