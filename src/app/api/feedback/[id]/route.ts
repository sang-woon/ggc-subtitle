import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { feedbacks } from '@/db/schema';
import { eq } from 'drizzle-orm';

// DELETE - 피드백 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(feedbacks)
      .where(eq(feedbacks.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: '피드백을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Feedback DELETE] Error:', error);
    return NextResponse.json(
      { error: '피드백 삭제에 실패했습니다' },
      { status: 500 }
    );
  }
}

// PATCH - 피드백 상태 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!['pending', 'reviewed', 'resolved'].includes(status)) {
      return NextResponse.json(
        { error: '유효하지 않은 상태입니다' },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(feedbacks)
      .set({ status, updatedAt: new Date() })
      .where(eq(feedbacks.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: '피드백을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Feedback PATCH] Error:', error);
    return NextResponse.json(
      { error: '피드백 업데이트에 실패했습니다' },
      { status: 500 }
    );
  }
}
