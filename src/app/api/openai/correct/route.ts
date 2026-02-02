import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 의회 관련 키워드 (보정 힌트용)
const PARLIAMENT_TERMS = [
  '위원장', '부위원장', '의원', '의장', '부의장',
  '상임위원회', '특별위원회', '본회의', '위원회',
  '경기도', '경기도의회', '도지사', '도정',
  '의안', '조례안', '예산안', '결산',
  '찬성', '반대', '기권', '가결', '부결',
  '심사', '보고', '의결', '회의', '개회', '폐회',
  '출석', '성원', '정족수', '안건', '상정',
];

/**
 * OpenAI GPT를 사용한 자막 보정 API
 *
 * POST /api/openai/correct
 * Body: { text: string, context?: string }
 * Response: { corrected: string, original: string }
 */
export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    );
  }

  try {
    const { text, context } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'text is required' },
        { status: 400 }
      );
    }

    // 너무 짧은 텍스트는 보정 불필요
    if (text.trim().length < 5) {
      return NextResponse.json({
        corrected: text.trim(),
        original: text,
        skipped: true,
      });
    }

    const systemPrompt = `당신은 한국어 의회 회의록 자막 교정 전문가입니다.
음성인식(STT) 결과를 자연스러운 한국어로 교정해주세요.

교정 규칙:
1. 중복된 단어/음절 제거 (예: "의결 의결" → "의결", "심사심사" → "심사")
2. 끊어진 문장 연결 (예: "하겠습니다 니다" → "하겠습니다")
3. 의회 용어 정확하게 교정
4. 문법적으로 자연스럽게 수정
5. 원래 의미는 절대 변경하지 않기
6. 없는 내용 추가하지 않기

의회 관련 용어 참고: ${PARLIAMENT_TERMS.join(', ')}

입력된 텍스트만 교정하여 출력하세요. 설명이나 다른 문장 없이 교정된 텍스트만 반환하세요.`;

    const userPrompt = context
      ? `이전 문맥: ${context}\n\n교정할 텍스트: ${text}`
      : `교정할 텍스트: ${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // 빠르고 저렴한 모델
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 낮은 온도로 일관된 결과
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { error: 'OpenAI API error', details: error },
        { status: response.status }
      );
    }

    const result = await response.json();
    const corrected = result.choices?.[0]?.message?.content?.trim() || text;

    return NextResponse.json({
      corrected,
      original: text,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Correction error:', error);
    return NextResponse.json(
      { error: 'Failed to correct text' },
      { status: 500 }
    );
  }
}
