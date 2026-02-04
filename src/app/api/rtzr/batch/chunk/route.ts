import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분

interface ChunkTranscribeRequest {
  videoUrl: string;
  startMs: number;
  endMs: number;
  chunkIndex: number;
}

// 의회 관련 키워드 부스팅
const KEYWORDS = [
  '위원장', '부위원장', '의원', '의장', '부의장',
  '상임위원회', '특별위원회', '본회의', '위원회',
  '의안', '조례안', '동의안', '결의안', '건의안',
  '청원', '진정', '질의', '답변', '토론',
  '찬성', '반대', '기권', '가결', '부결',
  '예산', '결산', '추경', '세입', '세출',
  '경기도', '경기도의회', '도지사', '부지사',
  '안녕하십니까', '감사합니다', '존경하는',
];

/**
 * RTZR 토큰 가져오기
 */
async function getRtzrToken(): Promise<string> {
  const clientId = process.env.RTZR_CLIENT_ID;
  const clientSecret = process.env.RTZR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('RTZR credentials not configured');
  }

  const response = await fetch('https://openapi.vito.ai/v1/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `client_id=${clientId}&client_secret=${clientSecret}`,
  });

  if (!response.ok) {
    throw new Error('Failed to get RTZR token');
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * POST /api/rtzr/batch/chunk
 * 비디오 청크 전사 시작 (비동기)
 *
 * 참고: 실제 분할은 클라이언트 또는 별도 서비스에서 수행
 * 이 엔드포인트는 전체 파일을 받아서 전사를 시작하고 ID를 반환
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChunkTranscribeRequest = await request.json();
    const { videoUrl, startMs, endMs, chunkIndex } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required' },
        { status: 400 }
      );
    }

    console.log(`[Chunk ${chunkIndex}] Starting transcription: ${startMs}ms - ${endMs}ms`);

    // 토큰 획득
    const token = await getRtzrToken();

    // 비디오 다운로드 (전체 파일 - 청크 분할은 RTZR가 처리)
    // 참고: 실제 구현에서는 ffmpeg로 청크 추출 필요
    const videoResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    console.log(`[Chunk ${chunkIndex}] Video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`);

    // RTZR 전사 시작
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('config', JSON.stringify({
      use_itn: true,
      use_disfluency_filter: true,
      use_profanity_filter: false,
      domain: 'MEETING',
      keywords: KEYWORDS,
    }));

    const transcribeResponse = await fetch('https://openapi.vito.ai/v1/transcribe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      throw new Error(`Transcription failed: ${errorText}`);
    }

    const { id: transcribeId } = await transcribeResponse.json();

    console.log(`[Chunk ${chunkIndex}] Transcription started: ${transcribeId}`);

    return NextResponse.json({
      success: true,
      transcribeId,
      chunkIndex,
      startMs,
      endMs,
    });
  } catch (error) {
    console.error('[Chunk] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chunk transcription failed' },
      { status: 500 }
    );
  }
}
