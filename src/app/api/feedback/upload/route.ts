import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role 키 사용 (서버 사이드에서만 사용, 업로드 권한 필요)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST - 이미지 업로드
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 없습니다' },
        { status: 400 }
      );
    }

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기는 5MB 이하여야 합니다' },
        { status: 400 }
      );
    }

    // 이미지 타입 확인
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: '이미지 파일만 업로드 가능합니다' },
        { status: 400 }
      );
    }

    // 파일명 생성 (유니크)
    const ext = file.name.split('.').pop();
    const fileName = `feedback/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    // Supabase Storage에 업로드
    const arrayBuffer = await file.arrayBuffer();
    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('[Upload] Supabase error:', error);
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다' },
        { status: 500 }
      );
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(data.path);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: '이미지 업로드에 실패했습니다' },
      { status: 500 }
    );
  }
}
