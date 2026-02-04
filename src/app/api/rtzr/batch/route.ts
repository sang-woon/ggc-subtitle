import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분 (Vercel Pro 기준)

interface BatchTranscribeRequest {
  videoUrl: string;
  sessionId?: string;
}

interface TranscribeStatus {
  id: string;
  status: 'queued' | 'transcribing' | 'completed' | 'failed';
  progress?: number;
  results?: TranscribeResults;
  error?: string;
}

interface TranscribeResults {
  utterances: Utterance[];
}

interface Utterance {
  start_at: number; // milliseconds
  duration: number;
  msg: string;
  spk: number;
}

// 의회 관련 키워드 부스팅
const KEYWORDS = [
  // 의회 관련
  '위원장', '부위원장', '의원', '의장', '부의장',
  '상임위원회', '특별위원회', '본회의', '위원회',
  '기획재정위원회', '행정자치위원회', '교육문화위원회',
  '건설교통위원회', '안전행정위원회', '보건복지위원회',
  '농정해양위원회', '환경도시위원회', '경제관광위원회',
  // 의회 용어
  '의안', '조례안', '동의안', '결의안', '건의안',
  '청원', '진정', '질의', '답변', '토론',
  '찬성', '반대', '기권', '가결', '부결',
  '회의록', '속기록', '표결', '의결',
  // 행정 용어
  '예산', '결산', '추경', '세입', '세출',
  '도정', '시정', '군정', '행정사무감사',
  '경기도', '경기도의회', '도지사', '부지사',
  // 일반 한국어 개선
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
 * MP4 URL에서 파일 스트림 가져오기
 */
async function fetchVideoAsBlob(videoUrl: string): Promise<Blob> {
  console.log('[Batch] Fetching video from:', videoUrl);

  const response = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.status}`);
  }

  const blob = await response.blob();
  console.log('[Batch] Video size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

  // 2GB 제한 체크
  if (blob.size > 2 * 1024 * 1024 * 1024) {
    throw new Error('Video file too large (max 2GB)');
  }

  return blob;
}

/**
 * RTZR 배치 전사 시작
 */
async function startTranscription(token: string, videoBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', videoBlob, 'video.mp4');
  formData.append('config', JSON.stringify({
    use_itn: true,
    use_disfluency_filter: true,
    use_profanity_filter: false,
    domain: 'MEETING',
    keywords: KEYWORDS,
  }));

  console.log('[Batch] Starting transcription...');

  const response = await fetch('https://openapi.vito.ai/v1/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Batch] Transcription start failed:', errorText);
    throw new Error(`Transcription start failed: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Batch] Transcription started, ID:', data.id);
  return data.id;
}

/**
 * 전사 상태 폴링
 */
async function pollTranscriptionStatus(
  token: string,
  transcribeId: string,
  maxWaitMs: number = 4 * 60 * 60 * 1000 // 4시간
): Promise<TranscribeResults> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5초

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `https://openapi.vito.ai/v1/transcribe/${transcribeId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.warn('[Batch] Poll failed, retrying...');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      continue;
    }

    const data: TranscribeStatus = await response.json();
    console.log('[Batch] Status:', data.status);

    if (data.status === 'completed' && data.results) {
      return data.results;
    }

    if (data.status === 'failed') {
      throw new Error('Transcription failed: ' + (data.error || 'Unknown error'));
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Transcription timeout');
}

/**
 * POST /api/rtzr/batch
 * MP4 배치 전사 시작 및 결과 반환
 */
export async function POST(request: NextRequest) {
  try {
    const body: BatchTranscribeRequest = await request.json();
    const { videoUrl, sessionId } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required' },
        { status: 400 }
      );
    }

    // MP4 URL 검증
    if (!videoUrl.includes('.mp4') && !videoUrl.includes('vodViewer')) {
      return NextResponse.json(
        { error: 'Only MP4 videos are supported for batch transcription' },
        { status: 400 }
      );
    }

    console.log('[Batch] Starting batch transcription for:', videoUrl);
    console.log('[Batch] Session ID:', sessionId);

    // 1. RTZR 토큰 획득
    const token = await getRtzrToken();

    // 2. 비디오 다운로드
    const videoBlob = await fetchVideoAsBlob(videoUrl);

    // 3. 전사 시작
    const transcribeId = await startTranscription(token, videoBlob);

    // 4. 결과 폴링 (동기 방식 - 긴 영상은 타임아웃 가능)
    // TODO: P4-T4.3에서 비동기 방식으로 개선
    const results = await pollTranscriptionStatus(token, transcribeId);

    // 5. 결과 변환 (RTZR 형식 → 내부 형식)
    const subtitles = results.utterances.map((u, index) => ({
      id: `batch-${transcribeId}-${index}`,
      startTime: u.start_at,
      endTime: u.start_at + u.duration,
      text: u.msg,
      speaker: u.spk,
      isFinal: true,
    }));

    console.log('[Batch] Transcription completed, subtitles:', subtitles.length);

    return NextResponse.json({
      success: true,
      transcribeId,
      subtitles,
      totalDuration: subtitles.length > 0
        ? subtitles[subtitles.length - 1].endTime
        : 0,
    });
  } catch (error) {
    console.error('[Batch] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Batch transcription failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rtzr/batch?id={transcribeId}
 * 전사 상태 확인 (비동기 폴링용)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcribeId = searchParams.get('id');

    if (!transcribeId) {
      return NextResponse.json(
        { error: 'transcribeId is required' },
        { status: 400 }
      );
    }

    const token = await getRtzrToken();

    const response = await fetch(
      `https://openapi.vito.ai/v1/transcribe/${transcribeId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to get transcription status' },
        { status: response.status }
      );
    }

    const data: TranscribeStatus = await response.json();

    // 완료된 경우 자막 형식으로 변환
    if (data.status === 'completed' && data.results) {
      const subtitles = data.results.utterances.map((u, index) => ({
        id: `batch-${transcribeId}-${index}`,
        startTime: u.start_at,
        endTime: u.start_at + u.duration,
        text: u.msg,
        speaker: u.spk,
        isFinal: true,
      }));

      return NextResponse.json({
        status: 'completed',
        subtitles,
        totalDuration: subtitles.length > 0
          ? subtitles[subtitles.length - 1].endTime
          : 0,
      });
    }

    return NextResponse.json({
      status: data.status,
      progress: data.progress,
      error: data.error,
    });
  } catch (error) {
    console.error('[Batch] Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
