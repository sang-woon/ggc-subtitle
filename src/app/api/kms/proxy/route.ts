// @SECURITY A01 - CORS 설정 강화 및 SSRF 방지
// @AUDIT 2026-02-01 보안 검사 시 수정

import { NextRequest, NextResponse } from 'next/server';

// 허용된 Origin 목록 (프로덕션에서는 환경변수로 관리 권장)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.NEXT_PUBLIC_APP_URL, // 프로덕션 URL
].filter(Boolean) as string[];

// 허용된 KMS 도메인 (SSRF 방지)
const ALLOWED_KMS_HOSTS = ['kms.ggc.go.kr'];

// Origin 검증 헬퍼 함수
function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');

  // 개발 환경에서는 모든 localhost 허용
  if (process.env.NODE_ENV === 'development') {
    if (origin?.startsWith('http://localhost:')) {
      return origin;
    }
  }

  // 허용된 Origin 확인
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // Same-origin 요청 (origin 헤더 없음)
  return null;
}

// URL 검증 헬퍼 함수 (SSRF 방지)
function isValidKmsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_KMS_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// KMS 비디오 프록시 - CORS 우회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'url parameter is required' },
        { status: 400 }
      );
    }

    // @SECURITY A10 - SSRF 방지: 정확한 URL 파싱 및 호스트 검증
    if (!isValidKmsUrl(videoUrl)) {
      return NextResponse.json(
        { error: 'Invalid KMS URL - only kms.ggc.go.kr is allowed' },
        { status: 400 }
      );
    }

    // Range 헤더 처리 (비디오 스트리밍 지원)
    const range = request.headers.get('range');
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://kms.ggc.go.kr/',
      'Accept': '*/*',
    };

    if (range) {
      headers['Range'] = range;
    }

    const response = await fetch(videoUrl, { headers });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: 'Failed to fetch video' },
        { status: response.status }
      );
    }

    // 응답 헤더 설정
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'video/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');

    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    // @SECURITY A05 - CORS 헤더 (Origin 기반 검증)
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
    } else if (process.env.NODE_ENV === 'development') {
      // 개발 환경에서만 fallback으로 * 허용
      responseHeaders.set('Access-Control-Allow-Origin', '*');
    }
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Video proxy error:', error);
    return NextResponse.json(
      { error: 'Video proxy failed' },
      { status: 500 }
    );
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS(request: NextRequest) {
  const allowedOrigin = getAllowedOrigin(request);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  } else if (process.env.NODE_ENV === 'development') {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
