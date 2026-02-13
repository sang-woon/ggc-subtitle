"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import { API_BASE_URL } from '@/lib/api';
import type { ChannelType } from '@/types';

type HealthStatus = {
  status: 'healthy' | 'unhealthy' | 'unknown';
  label: string;
};

type ImprovementStatus = 'done' | 'in-progress' | 'planned';

type ImprovementItem = {
  domain: string;
  feature: string;
  status: ImprovementStatus;
  phase: string;
  note: string;
};

type EnvironmentPair = {
  scope: 'frontend' | 'backend';
  key: string;
  value?: string;
  note: string;
  required: string;
};

type HowToRunStep = {
  title: string;
  command: string;
  description: string;
};

const quickActions = [
  {
    label: '실시간 방송',
    href: '/live',
    description: '채널 선택 및 실시간 자막',
  },
  {
    label: 'VOD 목록',
    href: '/vod',
    description: '회차별 STT·교정·대조 워크플로우',
  },
  {
    label: '의안관리',
    href: '/bills',
    description: '의안 등록과 회의 연결',
  },
  {
    label: '통합 검색',
    href: '/search',
    description: '자막 및 발언 검색',
  },
];

const improvementLog: ImprovementItem[] = [
  {
    domain: '실시간',
    feature: '18개 채널 HLS + WebSocket 자막',
    status: 'done',
    phase: 'Phase 2',
    note: '방송 상태 표시, 실시간 자막 스트림, 자막 패널 연동',
  },
  {
    domain: 'VOD',
    feature: 'VOD 등록/재생/시점 동기화',
    status: 'done',
    phase: 'Phase 3~5',
    note: 'KMS URL 자동 변환, MP4 재생, 재생속도 조절까지 지원',
  },
  {
    domain: '교정',
    feature: '용어 사전·문법 검사 및 일괄 교정',
    status: 'done',
    phase: 'Phase 6B',
    note: '용어 일괄 교체와 문법 수정 이력 반영',
  },
  {
    domain: '검증',
    feature: '대조관리 큐/상태 관리',
    status: 'done',
    phase: 'Phase 7',
    note: '신뢰도 기반 대조 대기열, 검토 통계, 일괄 처리 API',
  },
  {
    domain: '요약',
    feature: 'AI 회의 요약',
    status: 'done',
    phase: 'Phase 7',
    note: '회의 요약 생성, 조회, 삭제 및 화면 표시',
  },
  {
    domain: '안정성',
    feature: 'Railway 대응 운영 개선',
    status: 'done',
    phase: 'Phase 8',
    note: 'self-ping, AutoStt 전체 정리, 배치 교정 생명주기',
  },
  {
    domain: '플랫폼',
    feature: '통합 셸 UI',
    status: 'done',
    phase: 'Phase 9',
    note: '사이드바/헤더/브레드크럼/워크플로우 내비게이션',
  },
  {
    domain: '운영',
    feature: '관리자 기능 개선 화면',
    status: 'in-progress',
    phase: '요청 반영',
    note: '개선 히스토리/환경 정보/실행 가이드 노출',
  },
  {
    domain: '운영',
    feature: '알림/모니터링 대시보드 고도화',
    status: 'planned',
    phase: 'Next',
    note: '지연/오류 임계값 알림, 로그 연결, 사용자 액션 히스토리',
  },
];

const technologySummary = [
  {
    title: 'Frontend',
    items: ['Next.js 14 (App Router)', 'TypeScript strict', 'TailwindCSS', 'SWR', 'HLS.js'],
  },
  {
    title: 'Backend',
    items: ['FastAPI', 'WebSocket', 'httpx', 'Supabase REST', 'pytest'],
  },
  {
    title: 'Infra',
    items: ['Vercel Frontend', 'Railway Backend', 'Supabase DB', 'PostgreSQL'],
  },
];

const envChecklist: EnvironmentPair[] = [
  {
    scope: 'frontend',
    key: 'NEXT_PUBLIC_API_URL',
    value: process.env.NEXT_PUBLIC_API_URL,
    note: '백엔드 API 기본 URL',
    required: '필수',
  },
  {
    scope: 'frontend',
    key: 'NEXT_PUBLIC_WS_URL',
    value: process.env.NEXT_PUBLIC_WS_URL,
    note: '실시간 자막 WebSocket 기본 URL',
    required: '필수',
  },
  {
    scope: 'frontend',
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    value: process.env.NEXT_PUBLIC_SUPABASE_URL,
    note: 'Supabase 연동 URL(있을 경우)',
    required: '조건',
  },
  {
    scope: 'frontend',
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    note: 'Supabase 공개 키',
    required: '조건',
  },
  {
    scope: 'backend',
    key: 'SUPABASE_URL',
    note: '백엔드 환경 변수(클라이언트 미표시)',
    required: '필수',
  },
  {
    scope: 'backend',
    key: 'SUPABASE_KEY',
    note: '백엔드 환경 변수(클라이언트 미표시)',
    required: '필수',
  },
  {
    scope: 'backend',
    key: 'OPENAI_API_KEY',
    note: 'AI 교정/요약용 서버 키(서버 전용)',
    required: '필수',
  },
  {
    scope: 'backend',
    key: 'DEEPGRAM_API_KEY',
    note: 'Deepgram STT 연동 키(서버 전용)',
    required: '필수',
  },
];

const runGuide: HowToRunStep[] = [
  {
    title: '백엔드 기동',
    command: 'cd backend\npython -m venv .venv\n.\\.venv\\Scripts\\activate\npip install -r requirements.txt\nuvicorn app.main:app --reload --port 8000',
    description: '백엔드 API 서버를 개발 모드로 띄웁니다.',
  },
  {
    title: '프론트엔드 기동',
    command: 'cd frontend\nnpm install\nnpm run dev',
    description: '프론트엔드를 개발 모드로 띄워 브라우저로 확인합니다.',
  },
  {
    title: '테스트',
    command: 'cd frontend\nnpx jest\ncd ../backend\npython -m pytest -v',
    description: 'UI/서비스 테스트를 한 번에 점검합니다.',
  },
  {
    title: '배포 빌드 검증',
    command: 'cd frontend\nnpm run build\ncd ../backend\npython -m pytest -q',
    description: '빌드 가능 여부 및 핵심 테스트를 빠르게 확인합니다.',
  },
];

const statusChipClass: Record<ImprovementStatus, string> = {
  done: 'border-green-200 bg-green-50 text-green-700',
  'in-progress': 'border-amber-200 bg-amber-50 text-amber-700',
  planned: 'border-sky-200 bg-sky-50 text-sky-700',
};

const statusLabel: Record<ImprovementStatus, string> = {
  done: '완료',
  'in-progress': '진행 중',
  planned: '예정',
};

const hiddenMask = (value?: string): string => {
  if (!value) {
    return '미설정';
  }

  if (value.length <= 10) {
    return '****';
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export default function AdminPage() {
  const [health, setHealth] = useState<HealthStatus>({ status: 'unknown', label: '확인 대기' });
  const [channels, setChannels] = useState<ChannelType[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const channelStats = useMemo(() => {
    const total = channels.length;
    const onAir = channels.filter((channel) => channel.livestatus === 1).length;
    const sttRunning = channels.filter((channel) => channel.stt_running).length;
    const staleLive = channels.filter((channel) => channel.livestatus === 1 && !channel.stt_running).length;

    return {
      total,
      onAir,
      sttRunning,
      staleLive,
    };
  }, [channels]);

  const improvementSummary = useMemo(() => {
    return {
      done: improvementLog.filter((item) => item.status === 'done').length,
      inProgress: improvementLog.filter((item) => item.status === 'in-progress').length,
      planned: improvementLog.filter((item) => item.status === 'planned').length,
    };
  }, []);

  const runDiagnostics = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);

    if (typeof fetch !== 'function') {
      setHealth({ status: 'unknown', label: '브라우저 fetch 미지원' });
      setChannels([]);
      setIsRefreshing(false);
      return;
    }

    try {
      const [healthRes, channelRes] = await Promise.all([
        fetch(`${API_BASE_URL}/health`, { cache: 'no-store' }),
        fetch(`${API_BASE_URL}/api/channels/status`, { cache: 'no-store' }),
      ]);

      if (!healthRes.ok || !channelRes.ok) {
        setHealth({
          status: 'unhealthy',
          label: `HTTP 오류: ${healthRes.status}/${channelRes.status}`,
        });
        setChannels([]);
      } else {
        const healthData = await healthRes.json();
        const channelData = await channelRes.json();

        setHealth({
          status: healthData?.status === 'healthy' ? 'healthy' : 'unhealthy',
          label: healthData?.status || 'health 응답 없음',
        });

        setChannels(Array.isArray(channelData) ? (channelData as ChannelType[]) : []);
      }
    } catch (error) {
      setHealth({ status: 'unhealthy', label: 'API 요청 실패' });
      setChannels([]);
      setErrorMessage(error instanceof Error ? error.message : '네트워크 오류');
    } finally {
      setLastCheckedAt(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  return (
    <div className="min-h-[60vh] p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">시스템관리</h1>
              <p className="mt-1 text-sm text-gray-500">운영 점검과 핵심 지표를 한곳에서 확인합니다.</p>
            </div>
            <button
              type="button"
              onClick={runDiagnostics}
              disabled={isRefreshing}
              className="rounded-md border border-primary px-4 py-2 text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {isRefreshing ? '점검 중...' : '시스템 점검'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">API 상태</p>
              <p
                className={`text-sm font-semibold ${health.status === 'healthy' ? 'text-green-600' : health.status === 'unhealthy' ? 'text-red-600' : 'text-gray-600'}`}
              >
                {health.label}
              </p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">채널 수</p>
              <p className="text-sm font-semibold text-gray-900">{channelStats.total}개</p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">방송중 채널</p>
              <p className="text-sm font-semibold text-gray-900">{channelStats.onAir}개</p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">STT 실행</p>
              <p className="text-sm font-semibold text-gray-900">{channelStats.sttRunning}개</p>
            </div>
          </div>

          {lastCheckedAt && <p className="mt-3 text-xs text-gray-400">마지막 점검: {lastCheckedAt}</p>}

          {channelStats.staleLive > 0 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
              방송중이지만 STT가 비활성인 채널이 {channelStats.staleLive}개 있습니다.
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">오류: {errorMessage}</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">기능 개선 이력(일목요연)</h2>
              <p className="mt-1 text-sm text-gray-500">요청/개발 이력과 현재 상태를 한눈에 확인합니다.</p>
            </div>
            <div className="text-xs text-gray-500">
              완료 {improvementSummary.done}건 · 진행 중 {improvementSummary.inProgress}건 · 예정 {improvementSummary.planned}건
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {improvementLog.map((item) => (
              <article key={`${item.domain}-${item.feature}`} className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{item.domain}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusChipClass[item.status]}`}>{statusLabel[item.status]}</span>
                </div>
                <p className="text-sm text-gray-900">{item.feature}</p>
                <p className="mt-2 text-xs text-gray-500">근거: {item.phase}</p>
                <p className="mt-1 text-xs text-gray-500">{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">기술 스택</h2>
            <div className="mt-3 space-y-3">
              {technologySummary.map((group) => (
                <div key={group.title} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{group.title}</p>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {group.items.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900">환경변수 · API 키 점검</h2>
            <p className="mt-1 text-sm text-gray-500">클라이언트 노출 대상과 백엔드 전용 키를 분리해 관리합니다.</p>

            <div className="mt-4 space-y-2">
              {envChecklist.map((entry) => (
                <div key={entry.key} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{entry.key}</p>
                    <span className="text-xs text-gray-500">{entry.scope}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">필수: {entry.required}</p>
                  <p className="mt-1 font-mono text-xs text-gray-600">
                    값: {entry.value ? hiddenMask(entry.value) : '서버/브라우저 미설정'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{entry.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">실행 방법</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {runGuide.map((step) => (
              <div key={step.title} className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">{step.title}</p>
                <p className="mt-1 text-xs text-gray-500">{step.description}</p>
                <pre className="mt-2 whitespace-pre-wrap rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                  {step.command}
                </pre>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">빠른 작업</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="rounded-md border border-gray-100 bg-gray-50 p-4 hover:border-primary hover:bg-primary/5"
              >
                <p className="font-medium text-gray-900">{action.label}</p>
                <p className="mt-1 text-sm text-gray-500">{action.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
