import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { feedbacks } from '@/db/schema';
import { desc } from 'drizzle-orm';

// GET - 피드백 목록 조회
export async function GET() {
  try {
    const result = await db
      .select()
      .from(feedbacks)
      .orderBy(desc(feedbacks.createdAt))
      .limit(100);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Feedback GET] Error:', error);
    return NextResponse.json(
      { error: '피드백 목록을 불러올 수 없습니다' },
      { status: 500 }
    );
  }
}

// POST - 새 피드백 작성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, authorName, imageUrls } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: '제목과 내용을 입력해주세요' },
        { status: 400 }
      );
    }

    const [newFeedback] = await db
      .insert(feedbacks)
      .values({
        title,
        content,
        authorName: authorName || '익명',
        imageUrls: imageUrls || [],
        status: 'pending',
      })
      .returning();

    return NextResponse.json(newFeedback, { status: 201 });
  } catch (error) {
    console.error('[Feedback POST] Error:', error);
    return NextResponse.json(
      { error: '피드백 저장에 실패했습니다' },
      { status: 500 }
    );
  }
}
