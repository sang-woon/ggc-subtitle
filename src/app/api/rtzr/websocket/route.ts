import { NextRequest } from 'next/server';
import WebSocket from 'ws';

// Node.js 런타임 사용 (Edge 런타임 대신)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-Sent Events를 사용한 RTZR 스트리밍 프록시
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'token is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // SSE 스트림 설정
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const params = new URLSearchParams({
        sample_rate: '16000',
        encoding: 'LINEAR16',
        use_itn: 'true',
        use_disfluency_filter: 'true',
        use_profanity_filter: 'false',
        domain: 'MEETING',
      });

      const wsUrl = `wss://openapi.vito.ai/v1/transcribe:streaming?${params}`;

      try {
        const ws = new WebSocket(wsUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        ws.on('open', () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'transcript', data: message })}\n\n`));
          } catch (e) {
            console.error('Failed to parse RTZR message:', e);
          }
        });

        ws.on('error', (error) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
        });

        ws.on('close', () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'closed' })}\n\n`));
          controller.close();
        });

        // Cleanup on abort
        request.signal.addEventListener('abort', () => {
          ws.close();
        });
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'WebSocket connection failed' })}\n\n`));
        controller.close();
      }
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
