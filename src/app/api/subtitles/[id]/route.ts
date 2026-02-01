// @TASK T1.5 - 자막 수정/삭제 API
// @SPEC docs/planning/06-tasks.md#t15

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { subtitles, subtitleEdits } from '@/db/schema';
import { eq } from 'drizzle-orm';

// 자막 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'text is required and must be a string' },
        { status: 400 }
      );
    }

    // 기존 자막 조회
    const [existingSubtitle] = await db
      .select()
      .from(subtitles)
      .where(eq(subtitles.id, id))
      .limit(1);

    if (!existingSubtitle) {
      return NextResponse.json({ error: 'Subtitle not found' }, { status: 404 });
    }

    // 변경 사항 없으면 그대로 반환
    if (existingSubtitle.text === text) {
      return NextResponse.json({ subtitle: existingSubtitle });
    }

    // 수정 이력 저장
    await db.insert(subtitleEdits).values({
      subtitleId: id,
      oldText: existingSubtitle.text,
      newText: text,
      editedBy: 'user', // TODO: 인증 시스템 추가 시 실제 사용자 ID
    });

    // 자막 업데이트
    const [updatedSubtitle] = await db
      .update(subtitles)
      .set({
        text,
        isEdited: true,
        originalText: existingSubtitle.originalText || existingSubtitle.text,
        updatedAt: new Date(),
      })
      .where(eq(subtitles.id, id))
      .returning();

    return NextResponse.json({ subtitle: updatedSubtitle });
  } catch (error) {
    console.error('Failed to update subtitle:', error);
    return NextResponse.json(
      { error: 'Failed to update subtitle' },
      { status: 500 }
    );
  }
}

// 자막 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deletedSubtitle] = await db
      .delete(subtitles)
      .where(eq(subtitles.id, id))
      .returning();

    if (!deletedSubtitle) {
      return NextResponse.json({ error: 'Subtitle not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, subtitle: deletedSubtitle });
  } catch (error) {
    console.error('Failed to delete subtitle:', error);
    return NextResponse.json(
      { error: 'Failed to delete subtitle' },
      { status: 500 }
    );
  }
}
