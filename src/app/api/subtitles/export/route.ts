import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { subtitles, videoSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

// 시간을 SRT 형식으로 변환 (00:00:00,000)
function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

// 시간을 VTT 형식으로 변환 (00:00:00.000)
function msToVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// SRT 형식으로 변환
function toSrt(subtitleList: { startTimeMs: number; endTimeMs: number; text: string }[]): string {
  return subtitleList
    .map((sub, index) => {
      return `${index + 1}\n${msToSrtTime(sub.startTimeMs)} --> ${msToSrtTime(sub.endTimeMs)}\n${sub.text}\n`;
    })
    .join('\n');
}

// VTT 형식으로 변환
function toVtt(subtitleList: { startTimeMs: number; endTimeMs: number; text: string }[]): string {
  const header = 'WEBVTT\n\n';
  const cues = subtitleList
    .map((sub, index) => {
      return `${index + 1}\n${msToVttTime(sub.startTimeMs)} --> ${msToVttTime(sub.endTimeMs)}\n${sub.text}\n`;
    })
    .join('\n');

  return header + cues;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const format = searchParams.get('format') || 'srt';

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (!['srt', 'vtt'].includes(format)) {
      return NextResponse.json(
        { error: 'format must be srt or vtt' },
        { status: 400 }
      );
    }

    // 세션 정보 가져오기 (파일명용)
    const sessionList = await db
      .select()
      .from(videoSessions)
      .where(eq(videoSessions.id, sessionId))
      .limit(1);

    if (sessionList.length === 0) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const session = sessionList[0];

    // 자막 가져오기
    const subtitleList = await db
      .select({
        startTimeMs: subtitles.startTimeMs,
        endTimeMs: subtitles.endTimeMs,
        text: subtitles.text,
      })
      .from(subtitles)
      .where(eq(subtitles.sessionId, sessionId))
      .orderBy(subtitles.startTimeMs);

    if (subtitleList.length === 0) {
      return NextResponse.json(
        { error: 'No subtitles found for this session' },
        { status: 404 }
      );
    }

    // 형식에 따라 변환
    const content = format === 'vtt' ? toVtt(subtitleList) : toSrt(subtitleList);
    const contentType = format === 'vtt' ? 'text/vtt' : 'application/x-subrip';
    const extension = format === 'vtt' ? 'vtt' : 'srt';

    // 파일명 생성
    const date = new Date(session.createdAt!).toISOString().split('T')[0];
    const title = session.title || `kms-${session.midx}`;
    const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${date}_${safeTitle}.${extension}`;

    // 응답 반환
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('Failed to export subtitles:', error);
    return NextResponse.json(
      { error: 'Failed to export subtitles' },
      { status: 500 }
    );
  }
}
