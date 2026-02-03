// @SECURITY A10 - SSRF 방지 강화
// @AUDIT 2026-02-01 보안 검사 시 수정

import { NextRequest, NextResponse } from 'next/server';

// 허용된 KMS 도메인 (SSRF 방지)
const ALLOWED_KMS_HOSTS = ['kms.ggc.go.kr'];

// URL 검증 헬퍼 함수 (SSRF 방지)
function isValidKmsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_KMS_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// KMS 페이지에서 비디오 URL 추출
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kmsUrl = searchParams.get('url');

    if (!kmsUrl) {
      return NextResponse.json(
        { error: 'url parameter is required' },
        { status: 400 }
      );
    }

    // @SECURITY A10 - SSRF 방지: 정확한 URL 파싱 및 호스트 검증
    if (!isValidKmsUrl(kmsUrl)) {
      return NextResponse.json(
        { error: 'Invalid KMS URL - only kms.ggc.go.kr is allowed' },
        { status: 400 }
      );
    }

    // midx 추출
    const midxMatch = kmsUrl.match(/midx=(\d+)/);
    const midx = midxMatch ? midxMatch[1] : null;

    if (!midx) {
      return NextResponse.json(
        { error: 'Could not extract midx from URL' },
        { status: 400 }
      );
    }

    // KMS 페이지 가져오기
    const response = await fetch(kmsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch KMS page' },
        { status: 500 }
      );
    }

    const html = await response.text();

    // 비디오 URL 추출 패턴들
    // 1. MP4 다운로드 링크에서 추출
    const mp4Match = html.match(/href="(\/mp4\/[^"]+\.mp4)"/);

    // 2. JavaScript 변수에서 추출
    const jsVideoMatch = html.match(/videoUrl\s*[=:]\s*["']([^"']+)["']/);

    // 3. source 태그에서 추출
    const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["']/);

    // 4. data 속성에서 추출
    const dataMatch = html.match(/data-video-url=["']([^"']+)["']/);

    // 5. m3u8 HLS 스트림 URL 추출 (DVR 녹화 영상용)
    const m3u8Match = html.match(/m3u8Url\s*=\s*["'](https:\/\/[^"']+\.m3u8[^"']*)["']/);

    // 6. m3u8 기본 URL만 추출 (DVR 파라미터 제외)
    const m3u8BaseMatch = html.match(/["'](https:\/\/stream\d+\.cdn\.gov-ntruss\.com\/live\/[^"']+\/playlist\.m3u8)/);

    let videoUrl = null;

    if (mp4Match) {
      videoUrl = `https://kms.ggc.go.kr${mp4Match[1]}`;
    } else if (jsVideoMatch) {
      videoUrl = jsVideoMatch[1].startsWith('http')
        ? jsVideoMatch[1]
        : `https://kms.ggc.go.kr${jsVideoMatch[1]}`;
    } else if (sourceMatch) {
      videoUrl = sourceMatch[1].startsWith('http')
        ? sourceMatch[1]
        : `https://kms.ggc.go.kr${sourceMatch[1]}`;
    } else if (dataMatch) {
      videoUrl = dataMatch[1].startsWith('http')
        ? dataMatch[1]
        : `https://kms.ggc.go.kr${dataMatch[1]}`;
    } else if (m3u8Match) {
      // m3u8 URL에서 DVR 파라미터 부분 제거하고 기본 URL만 사용
      videoUrl = m3u8Match[1].split('?')[0] + '?DVR';
    } else if (m3u8BaseMatch) {
      videoUrl = m3u8BaseMatch[1] + '?DVR';
    }

    // 제목 추출
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].split('|')[0].trim() : null;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Could not find video URL in KMS page' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      videoUrl,
      midx,
      title,
      kmsUrl,
    });
  } catch (error) {
    console.error('Failed to extract video URL:', error);
    return NextResponse.json(
      { error: 'Failed to extract video URL' },
      { status: 500 }
    );
  }
}
