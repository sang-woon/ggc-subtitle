import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// PCM to WAV 변환
function pcmToWav(pcmData: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data
  const pcmView = new Uint8Array(pcmData);
  const wavView = new Uint8Array(buffer);
  wavView.set(pcmView, headerSize);

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob;
    const token = formData.get('token') as string;
    const sampleRate = parseInt(formData.get('sampleRate') as string) || 16000;

    if (!audioBlob || !token) {
      return NextResponse.json(
        { error: 'audio and token are required' },
        { status: 400 }
      );
    }

    // PCM을 WAV로 변환
    const pcmData = await audioBlob.arrayBuffer();
    const wavData = pcmToWav(pcmData, sampleRate);
    const wavBlob = new Blob([wavData], { type: 'audio/wav' });

    // RTZR 파일 전사 API 호출
    const rtzrFormData = new FormData();
    rtzrFormData.append('file', wavBlob, 'audio.wav');
    // 경기도의회 관련 키워드 부스팅 (한국어 정확도 향상)
    const keywords = [
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

    rtzrFormData.append('config', JSON.stringify({
      use_itn: true,
      use_disfluency_filter: true,
      use_profanity_filter: false,
      domain: 'MEETING',
      keywords: keywords,
    }));

    // 1. 전사 작업 생성
    const transcribeResponse = await fetch('https://openapi.vito.ai/v1/transcribe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: rtzrFormData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('RTZR transcribe error:', errorText);
      return NextResponse.json(
        { error: 'RTZR transcribe failed', details: errorText },
        { status: transcribeResponse.status }
      );
    }

    const { id: transcribeId } = await transcribeResponse.json();

    // 2. 결과 폴링 (최대 30초)
    let result = null;
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(
        `https://openapi.vito.ai/v1/transcribe/${transcribeId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!statusResponse.ok) {
        continue;
      }

      const statusData = await statusResponse.json();

      if (statusData.status === 'completed') {
        result = statusData.results;
        break;
      } else if (statusData.status === 'failed') {
        return NextResponse.json(
          { error: 'Transcription failed' },
          { status: 500 }
        );
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Transcription timeout' },
        { status: 504 }
      );
    }

    // 결과에서 텍스트 추출
    const utterances = result.utterances || [];
    const text = utterances.map((u: { msg: string }) => u.msg).join(' ');

    return NextResponse.json({
      text,
      isFinal: true,
      utterances,
    });
  } catch (error) {
    console.error('Transcribe API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
