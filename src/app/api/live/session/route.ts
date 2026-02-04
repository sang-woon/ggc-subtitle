import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { liveSessions } from '@/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';

const HEARTBEAT_TIMEOUT_MS = 10000; // 10초 타임아웃

/**
 * GET /api/live/session?channel=<channelCode>
 * 현재 채널의 리더 정보 조회
 * - 리더가 있고 활성 상태면 리더 정보 반환
 * - 리더가 없거나 stale이면 null 반환 (새 리더 등록 가능)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelCode = searchParams.get('channel');

    if (!channelCode) {
      return NextResponse.json({ error: 'channel parameter required' }, { status: 400 });
    }

    // Stale 리더 정리 (10초 이상 heartbeat 없는 세션)
    const staleThreshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    await db
      .update(liveSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.isActive, true),
          lt(liveSessions.lastHeartbeat, staleThreshold)
        )
      );

    // 현재 활성 리더 조회
    const [session] = await db
      .select()
      .from(liveSessions)
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.isActive, true)
        )
      )
      .limit(1);

    if (!session) {
      return NextResponse.json({ leader: null, canBecomeLeader: true });
    }

    return NextResponse.json({
      leader: {
        id: session.leaderId,
        channelCode: session.channelCode,
        lastHeartbeat: session.lastHeartbeat,
      },
      canBecomeLeader: false,
    });
  } catch (error) {
    console.error('[LiveSession] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/live/session
 * 리더로 등록
 * Body: { channelCode: string, clientId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelCode, clientId } = body;

    if (!channelCode || !clientId) {
      return NextResponse.json(
        { error: 'channelCode and clientId required' },
        { status: 400 }
      );
    }

    // Stale 리더 정리
    const staleThreshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    await db
      .update(liveSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.isActive, true),
          lt(liveSessions.lastHeartbeat, staleThreshold)
        )
      );

    // 이미 활성 리더가 있는지 확인
    const [existingSession] = await db
      .select()
      .from(liveSessions)
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.isActive, true)
        )
      )
      .limit(1);

    if (existingSession) {
      // 이미 리더가 있음 - Follower로 참여해야 함
      return NextResponse.json({
        success: false,
        role: 'follower',
        leader: {
          id: existingSession.leaderId,
          channelCode: existingSession.channelCode,
        },
      });
    }

    // 새 리더로 등록 (upsert)
    await db
      .insert(liveSessions)
      .values({
        channelCode,
        leaderId: clientId,
        isActive: true,
        lastHeartbeat: new Date(),
      })
      .onConflictDoUpdate({
        target: liveSessions.channelCode,
        set: {
          leaderId: clientId,
          isActive: true,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        },
      });

    console.log(`[LiveSession] New leader registered: ${clientId} for channel ${channelCode}`);

    return NextResponse.json({
      success: true,
      role: 'leader',
      channelCode,
    });
  } catch (error) {
    console.error('[LiveSession] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/live/session
 * 리더 Heartbeat 업데이트
 * Body: { channelCode: string, clientId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelCode, clientId } = body;

    if (!channelCode || !clientId) {
      return NextResponse.json(
        { error: 'channelCode and clientId required' },
        { status: 400 }
      );
    }

    // 현재 리더인지 확인하고 heartbeat 업데이트
    const result = await db
      .update(liveSessions)
      .set({
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.leaderId, clientId),
          eq(liveSessions.isActive, true)
        )
      )
      .returning();

    if (result.length === 0) {
      // 더 이상 리더가 아님 (다른 클라이언트가 리더가 됨)
      return NextResponse.json({
        success: false,
        role: 'follower',
        message: 'No longer the leader',
      });
    }

    return NextResponse.json({
      success: true,
      role: 'leader',
      lastHeartbeat: result[0].lastHeartbeat,
    });
  } catch (error) {
    console.error('[LiveSession] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/live/session
 * 리더 세션 종료
 * Body: { channelCode: string, clientId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelCode, clientId } = body;

    if (!channelCode || !clientId) {
      return NextResponse.json(
        { error: 'channelCode and clientId required' },
        { status: 400 }
      );
    }

    await db
      .update(liveSessions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(liveSessions.channelCode, channelCode),
          eq(liveSessions.leaderId, clientId)
        )
      );

    console.log(`[LiveSession] Leader ${clientId} ended session for channel ${channelCode}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LiveSession] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
