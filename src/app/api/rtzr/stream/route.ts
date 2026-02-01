import { NextRequest } from 'next/server';
import WebSocket from 'ws';

// 활성 WebSocket 세션 저장
const sessions = new Map<string, {
  ws: WebSocket;
  token: string;
  createdAt: number;
}>();

// 세션 정리 (10분 후 자동 종료)
setInterval(() => {
  const now = Date.now();
  sessions.forEach((session, id) => {
    if (now - session.createdAt > 10 * 60 * 1000) {
      session.ws.close();
      sessions.delete(id);
    }
  });
}, 60000);

// 의회 관련 키워드 (RTZR 키워드 부스팅)
const KEYWORDS = [
  '위원장', '부위원장', '의원', '의장', '부의장',
  '상임위원회', '특별위원회', '본회의', '위원회',
  '경기도', '경기도의회', '도지사', '도정',
  '의안', '조례안', '예산안', '결산',
  '찬성', '반대', '기권', '가결', '부결',
].join(',');

/**
 * SSE 스트리밍 - RTZR WebSocket에 연결하고 결과를 스트리밍
 *
 * 클라이언트는 이 엔드포인트에 EventSource로 연결하면
 * 중간 결과(isFinal: false)와 최종 결과(isFinal: true)를 실시간으로 받음
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const sessionId = searchParams.get('sessionId');
  const sampleRate = searchParams.get('sampleRate') || '16000';
  const encoding = searchParams.get('encoding') || 'LINEAR16';
  const domain = searchParams.get('domain') || 'MEETING';

  if (!token || !sessionId) {
    return new Response('token and sessionId are required', { status: 400 });
  }

  // RTZR WebSocket URL
  const wsUrl = new URL('wss://openapi.vito.ai/v1/transcribe:streaming');
  wsUrl.searchParams.set('sample_rate', sampleRate);
  wsUrl.searchParams.set('encoding', encoding);
  wsUrl.searchParams.set('use_itn', 'true');
  wsUrl.searchParams.set('use_disfluency_filter', 'true');
  wsUrl.searchParams.set('use_profanity_filter', 'false');
  wsUrl.searchParams.set('domain', domain);
  wsUrl.searchParams.set('keywords', KEYWORDS);
  // 화자 분리 활성화 (RTZR 스트리밍에서 지원되는 경우)
  wsUrl.searchParams.set('use_diarization', 'true');

  // SSE 스트림 설정
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      // 안전하게 데이터 전송하는 헬퍼 함수
      const safeEnqueue = (data: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // Controller가 이미 닫힌 경우 무시
            isClosed = true;
          }
        }
      };

      // RTZR WebSocket 연결
      const ws = new WebSocket(wsUrl.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      ws.on('open', () => {
        console.log(`[${sessionId}] RTZR WebSocket 연결됨`);
        sessions.set(sessionId, { ws, token, createdAt: Date.now() });

        // 연결 성공 이벤트
        safeEnqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          // RTZR 응답 형식:
          // { seq, start_at, duration, final, alternatives: [{ text, confidence, words }] }
          // 화자 분리 시: words에 spk (speaker) 정보 포함
          if (message.alternatives && message.alternatives.length > 0) {
            const alt = message.alternatives[0];

            // 화자 정보 추출 (words 배열에서)
            let speaker: number | null = null;
            if (alt.words && alt.words.length > 0) {
              // 첫 번째 단어의 화자 정보 사용
              speaker = alt.words[0].spk ?? null;
            }

            const result = {
              type: 'transcript',
              seq: message.seq,
              startAt: message.start_at,
              duration: message.duration,
              isFinal: message.final,  // false = 중간결과, true = 최종결과
              text: alt.text,
              confidence: alt.confidence,
              speaker, // 화자 번호 (0, 1, 2, ...)
            };

            safeEnqueue(`data: ${JSON.stringify(result)}\n\n`);
          }
        } catch (error) {
          console.error(`[${sessionId}] Message parse error:`, error);
        }
      });

      ws.on('error', (error) => {
        console.error(`[${sessionId}] RTZR WebSocket 에러:`, error);
        safeEnqueue(`data: ${JSON.stringify({ type: 'error', message: String(error) })}\n\n`);
      });

      ws.on('close', () => {
        console.log(`[${sessionId}] RTZR WebSocket 종료`);
        sessions.delete(sessionId);
        safeEnqueue(`data: ${JSON.stringify({ type: 'closed' })}\n\n`);
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // 이미 닫힌 경우 무시
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * 오디오 청크 전송 - 활성 WebSocket 세션에 오디오 데이터 전송
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const isEOS = searchParams.get('eos') === 'true';

    if (!sessionId) {
      return Response.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return Response.json({ error: 'Session not found. Start SSE stream first.' }, { status: 404 });
    }

    if (isEOS) {
      // 스트림 종료 신호
      session.ws.send('EOS');
      return Response.json({ success: true, message: 'EOS sent' });
    }

    // 오디오 데이터 전송
    const audioData = await request.arrayBuffer();
    if (audioData.byteLength > 0) {
      session.ws.send(Buffer.from(audioData));
    }

    return Response.json({ success: true, bytes: audioData.byteLength });
  } catch (error) {
    console.error('Stream POST error:', error);
    return Response.json({ error: 'Failed to send audio' }, { status: 500 });
  }
}
