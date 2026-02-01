# CLAUDE.md

> 이 파일은 Claude Code가 프로젝트 컨텍스트를 빠르게 파악하도록 돕습니다.

## 프로젝트 개요

- **이름**: ggc-subtitle (경기도의회 실시간 자막 시스템)
- **설명**: 경기도의회 KMS 영상에 실시간 한국어 자막을 생성하고 저장하는 시스템
- **기술 스택**: Next.js 16 + React 19 + TypeScript + Drizzle ORM + PostgreSQL (Supabase) + RTZR STT API

## 빠른 시작

```bash
# 설치
npm install

# 개발 서버
npm run dev

# 빌드
npm run build

# 린트
npm run lint
```

## 프로젝트 구조

```
ggc-subtitle/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── auth/rtzr/     # RTZR 토큰 발급
│   │   │   ├── kms/           # KMS 비디오 URL 추출, 프록시
│   │   │   ├── rtzr/          # RTZR STT 전사
│   │   │   ├── sessions/      # 세션 CRUD
│   │   │   └── subtitles/     # 자막 CRUD, 검색
│   │   ├── test-rtzr/         # RTZR 마이크 테스트
│   │   └── page.tsx           # 메인 페이지
│   ├── components/
│   │   ├── subtitle/          # 자막 UI (오버레이, 타임라인)
│   │   ├── video/             # 비디오 플레이어
│   │   └── ui/                # 공통 UI
│   ├── hooks/                 # React 훅
│   │   ├── useRtzrStream.ts   # RTZR 스트리밍
│   │   └── useSubtitleSession.ts # 자막 세션 관리
│   ├── lib/
│   │   ├── audio/             # 오디오 캡처
│   │   └── utils/             # 유틸리티
│   ├── db/                    # Drizzle ORM
│   │   ├── schema.ts          # 스키마 정의
│   │   └── client.ts          # DB 클라이언트
│   └── types/                 # TypeScript 타입
├── docs/planning/             # 기획 문서
│   └── 06-tasks.md            # 태스크 목록
└── .env.local                 # 환경변수
```

## 환경 변수

```
RTZR_CLIENT_ID=           # RTZR API 클라이언트 ID
RTZR_CLIENT_SECRET=       # RTZR API 시크릿
NEXT_PUBLIC_SUPABASE_URL= # Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase Anon Key
DATABASE_URL=             # PostgreSQL 연결 문자열
```

## 컨벤션

- 커밋 메시지: Conventional Commits (한글)
- 브랜치 전략: `main`, `phase/*`, `feature/*`, `fix/*`
- 코드 스타일: ESLint + Prettier (Next.js 기본)

---

## Auto-Orchestrate 진행 상황

> 이 섹션은 `/auto-orchestrate` 실행 시 자동으로 업데이트됩니다.

### 완료된 Phase

| Phase | 태스크 | 완료일 | 주요 내용 |
|-------|--------|--------|----------|
| P0 | 4/4 | 2026-02-01 | 프로젝트 셋업 완료 |
| P1 | 5/5 | 2026-02-01 | 핵심 기능 완료 (비디오, STT, 자막, DB 저장, 편집) |
| P2 | 3/3 | 2026-02-01 | 검색/히스토리 완료 (검색 UI, 히스토리 페이지, SRT/VTT 내보내기) |
| P3 | 3/3 | 2026-02-01 | 품질/배포 완료 (테스트 45개, 보안검사, Vercel 설정) |

### 현재 Phase

- **모든 Phase 완료!** (15/15 태스크)
- 배포 준비 완료: `npx vercel --prod` 실행하여 프로덕션 배포

### 재개 명령어

```bash
/auto-orchestrate --resume
```

---

## Lessons Learned

> 에이전트가 난관을 극복하며 발견한 교훈을 기록합니다.

### [2026-02-01] RTZR WebSocket 브라우저 제한

- **문제**: 브라우저 WebSocket은 Authorization 헤더를 설정할 수 없음
- **해결**: HTTP 배치 모드로 전환 (8초마다 오디오 청크 전송)
- **교훈**: 브라우저 환경의 WebSocket 제한을 미리 파악하고, HTTP 폴백 준비 필요

### [2026-02-01] KMS CORS 우회

- **문제**: KMS 비디오 직접 요청 시 CORS 에러
- **해결**: `/api/kms/proxy` 서버 프록시 구현
- **교훈**: 외부 미디어 서버 연동 시 프록시 필수

### [2026-02-01] 한국어 정확도 향상

- **문제**: STT 결과에서 의회 용어 인식률 낮음
- **해결**: RTZR 키워드 부스팅 기능 활용 (의회 관련 50+ 키워드)
- **교훈**: 도메인 특화 키워드 목록 사전 준비
