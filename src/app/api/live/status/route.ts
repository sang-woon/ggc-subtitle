import { NextResponse } from 'next/server';
import { LiveChannel, LiveStatusResponse } from '@/types/live';

// 정적 채널 목록 (경기도의회 생중계 채널)
const STATIC_CHANNELS: Omit<LiveChannel, 'status' | 'statusText' | 'streamUrl'>[] = [
  { name: '본회의', code: 'A011', ch: 'ch14', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '의회운영위원회', code: 'C001', ch: 'ch1', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '기획재정위원회', code: 'C105', ch: 'ch3', ip: 'stream02.cdn.gov-ntruss.com/live' },
  { name: '경제노동위원회', code: 'C205', ch: 'ch6', ip: 'stream02.cdn.gov-ntruss.com/live' },
  { name: '안전행정위원회', code: 'C301', ch: 'ch7', ip: 'stream02.cdn.gov-ntruss.com/live' },
  { name: '문화체육관광위원회', code: 'C501', ch: 'ch8', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '농정해양위원회', code: 'C601', ch: 'ch15', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '보건복지위원회', code: 'C701', ch: 'ch2', ip: 'stream02.cdn.gov-ntruss.com/live' },
  { name: '인사청문특별위원회(건설교통위원회)', code: 'C807', ch: 'ch12', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '도시환경위원회', code: 'C901', ch: 'ch13', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '미래과학협력위원회', code: 'C9043', ch: 'ch16', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '여성가족평생교육위', code: 'C905', ch: 'ch11', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '인사청문특별위원회(교육기획위원회)', code: 'C908', ch: 'ch4', ip: 'stream02.cdn.gov-ntruss.com/live' },
  { name: '교육행정위원회', code: 'C909', ch: 'ch5', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '도청 예산결산특별위', code: 'E020', ch: 'ch60', ip: 'stream01.cdn.gov-ntruss.com/live' },
  { name: '교육청 예산결산특별위', code: 'E030', ch: 'ch61', ip: 'stream01.cdn.gov-ntruss.com/live' },
];

interface OnairData {
  adCode: string;
  kmsLivestatus: number;
  mntsCmmtChn?: string;
}

/**
 * 경기도의회 생중계 상태 조회 API
 * /getOnairListTodayData.do API를 호출하여 현재 방송 상태 반환
 */
export async function GET() {
  try {
    // 오늘 날짜 (YYYY-MM-DD 형식) - 한국 표준시 기준
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    const today = koreaTime.toISOString().split('T')[0];

    // 경기도의회 API 호출
    const response = await fetch('https://live.ggc.go.kr/getOnairListTodayData.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://live.ggc.go.kr/onair/onair.do',
      },
      body: `ymd=${today}`,
      cache: 'no-store',
    });

    let liveStatusMap = new Map<string, number>();

    if (response.ok) {
      try {
        const data: OnairData[] = await response.json();
        // API 응답에서 각 채널의 상태 추출
        for (const item of data) {
          liveStatusMap.set(item.adCode, item.kmsLivestatus);
        }
        console.log(`[Live API] Date: ${today} (KST), Got status for`, data.length, 'channels:',
          data.map(d => `${d.adCode}=${d.kmsLivestatus}`).join(', '));
      } catch (parseError) {
        console.error('[Live API] Failed to parse response:', parseError);
      }
    } else {
      console.warn('[Live API] API returned status:', response.status);
    }

    // 정적 채널 목록에 상태 정보 병합
    const channels: LiveChannel[] = STATIC_CHANNELS.map((channel) => {
      const livestatus = liveStatusMap.get(channel.code);
      const status = getStatus(livestatus);
      const statusText = getStatusText(livestatus);

      // 스트림 URL 생성 (방송중일 때만)
      const streamUrl = status === 'live' && channel.ip && channel.ch
        ? `https://${channel.ip}/${channel.ch}/playlist.m3u8`
        : undefined;

      return {
        ...channel,
        status,
        statusText,
        streamUrl,
      };
    });

    // 방송중인 채널을 먼저 정렬
    channels.sort((a, b) => {
      const order = { live: 0, upcoming: 1, off: 2 };
      return order[a.status] - order[b.status];
    });

    const result: LiveStatusResponse = {
      channels,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Live API] Error:', error);

    // 에러 시에도 정적 채널 목록은 반환 (모두 off 상태)
    const channels: LiveChannel[] = STATIC_CHANNELS.map((channel) => ({
      ...channel,
      status: 'off' as const,
      statusText: '생중계없음',
      streamUrl: undefined,
    }));

    return NextResponse.json({
      channels,
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    } as LiveStatusResponse);
  }
}

/**
 * kmsLivestatus 코드를 상태 타입으로 변환
 * 0: 방송전, 1: 방송중, 2: 휴식, 3: 종료, 4: 생중계없음
 */
function getStatus(livestatus: number | undefined): 'live' | 'upcoming' | 'off' {
  switch (livestatus) {
    case 1:
      return 'live';
    case 0:
    case 2: // 휴식도 upcoming으로 처리
      return 'upcoming';
    default:
      return 'off';
  }
}

/**
 * kmsLivestatus 코드를 상태 텍스트로 변환
 */
function getStatusText(livestatus: number | undefined): string {
  switch (livestatus) {
    case 1:
      return '방송중';
    case 0:
      return '방송전';
    case 2:
      return '휴식중';
    case 3:
      return '종료';
    default:
      return '생중계없음';
  }
}
