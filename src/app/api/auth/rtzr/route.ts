// @SECURITY A05 - 환경변수 검증 적용
// @AUDIT 2026-02-01 보안 검사 시 수정

import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';

const RTZR_AUTH_URL = 'https://openapi.vito.ai/v1/authenticate';

export async function POST() {
  try {
    // 환경변수 검증 (Zod 스키마로 타입 안전성 보장)
    const env = getServerEnv();
    const clientId = env.RTZR_CLIENT_ID;
    const clientSecret = env.RTZR_CLIENT_SECRET;

    const response = await fetch(RTZR_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RTZR auth failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to authenticate with RTZR', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      token: data.access_token,
      expiresAt: data.expire_at,
    });
  } catch (error) {
    console.error('RTZR auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
