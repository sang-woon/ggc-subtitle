# CLAUDE.md - 경기도의회 실시간 자막 서비스

> AI 코딩 어시스턴트를 위한 프로젝트 컨텍스트

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **서비스명** | 경기도의회 실시간 자막 서비스 |
| **목적** | 의회 회의 영상에 실시간/VOD 자막 제공 |
| **핵심 기술** | Deepgram Nova-3 STT, WebSocket, HLS 스트리밍 |
| **상태** | Phase 0~3 완료, Phase 4 STT 파이프라인 + VOD 등록 기능 구현 |

---

## 기술 스택

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS
- **State**: SWR
- **Video**: HLS.js (실시간), HTML5 Video (VOD)
- **Test**: Jest + React Testing Library

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database**: Supabase (REST API 사용, asyncpg 미사용)
- **Realtime**: WebSocket (FastAPI)
- **STT**: Deepgram Nova-3 (Streaming WebSocket) / OpenAI Whisper API
- **HTTP Client**: httpx (KMS VOD 변환, 채널 상태 조회)
- **Test**: pytest

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway
- **Database**: Supabase
- **External**: 경기도의회 HLS 스트림 (18개 채널), KMS VOD 시스템

---

## 프로젝트 구조

```
/
├── frontend/                   # Next.js 14
│   ├── src/
│   │   ├── app/               # App Router (페이지)
│   │   │   ├── page.tsx       # 홈 대시보드 (/) + VOD 등록
│   │   │   ├── live/          # 실시간 뷰어 (/live)
│   │   │   └── vod/           # VOD (/vod, /vod/[id])
│   │   ├── components/        # UI 컴포넌트 (15개)
│   │   ├── hooks/             # 커스텀 훅 (8개)
│   │   ├── lib/               # API 클라이언트, Supabase
│   │   ├── types/             # TypeScript 타입
│   │   └── utils/             # 유틸리티 (highlight 등)
│   ├── e2e/                   # E2E 테스트 (Playwright)
│   └── package.json
│
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── api/               # REST API + WebSocket
│   │   │   ├── meetings.py    # 회의 CRUD + KMS URL 자동변환
│   │   │   ├── subtitles.py   # 자막 조회/검색
│   │   │   ├── channels.py    # 채널 목록/상태/STT 제어
│   │   │   └── websocket.py   # 실시간 자막 WS
│   │   ├── core/              # 설정, DB 연결, 채널 설정
│   │   │   ├── config.py      # Settings (Pydantic)
│   │   │   ├── database.py    # Supabase REST 클라이언트
│   │   │   └── channels.py    # 18개 HLS 채널 정적 설정
│   │   ├── models/            # SQLAlchemy 모델 (stub)
│   │   ├── schemas/           # Pydantic 스키마
│   │   ├── services/          # 비즈니스 로직
│   │   │   ├── deepgram_stt.py    # Deepgram Streaming STT
│   │   │   ├── channel_stt.py     # 채널별 STT 관리
│   │   │   ├── channel_status.py  # 채널 방송 상태 조회
│   │   │   ├── hls_parser.py      # HLS 마스터/미디어 플레이리스트 파싱
│   │   │   ├── kms_vod_resolver.py # KMS VOD URL → MP4 변환
│   │   │   ├── whisper.py         # Whisper STT (레거시)
│   │   │   ├── stream_processor.py # HLS 처리
│   │   │   ├── vod_processor.py   # VOD 자막 생성
│   │   │   └── dictionary.py      # 용어 사전
│   │   └── tasks/             # 백그라운드 태스크
│   ├── tests/                 # pytest 테스트
│   ├── migrations/            # DB 마이그레이션
│   └── requirements.txt
│
├── specs/                     # 도메인/화면 명세
├── docs/planning/             # 기획 문서 (01~07)
└── CLAUDE.md                  # 이 파일
```

---

## 핵심 도메인 리소스

### meetings
```yaml
endpoints:
  - GET /api/meetings           # 목록 (status, limit, offset)
  - GET /api/meetings/live      # 실시간 회의 (channel 파라미터)
  - GET /api/meetings/{id}      # 상세 (채널 ID도 가능)
  - POST /api/meetings          # VOD 등록 (KMS URL 자동 변환)

fields:
  - id, title, meeting_date
  - stream_url, vod_url
  - status (scheduled|live|processing|ended)
  - duration_seconds
```

### subtitles
```yaml
endpoints:
  - GET /api/meetings/{id}/subtitles        # 자막 목록
  - GET /api/meetings/{id}/subtitles/search # 검색
  - WS /ws/meetings/{id}/subtitles          # 실시간 (UUID 및 채널 ID 모두 지원)

fields:
  - id, meeting_id, start_time, end_time
  - text, speaker, confidence
```

### channels
```yaml
endpoints:
  - GET /api/channels                       # 전체 채널 목록 (18개)
  - GET /api/channels/status                # 채널 + 실시간 방송 상태
  - GET /api/channels/status/stream         # SSE 실시간 상태 스트림
  - GET /api/channels/{id}                  # 채널 상세
  - POST /api/channels/{id}/stt/start       # STT 시작
  - POST /api/channels/{id}/stt/stop        # STT 중지
  - GET /api/channels/{id}/stt/status       # STT 상태 확인

fields:
  - id (ch1~ch90), name, code, stream_url
  - livestatus (0=방송전, 1=방송중, 2=정회중, 3=종료, 4=생중계없음)
```

---

## 화면 구조

| ID | 화면 | 경로 | 핵심 기능 |
|----|------|------|-----------|
| S-01 | 홈 대시보드 | `/` | 실시간 회의 상태, 최근 VOD, VOD 등록 모달 |
| S-02 | 실시간 뷰어 | `/live` | 채널 선택 + HLS 스트리밍 + WebSocket 자막 |
| S-03 | VOD 목록 | `/vod` | VOD 테이블, 페이지네이션 |
| S-04 | VOD 뷰어 | `/vod/:id` | MP4 재생 + 자막 동기화 + 배속 |
| M-01 | VOD 등록 모달 | - | 폼 유효성 검사 + KMS/MP4 URL 등록 |

---

## 컴포넌트 맵 (15개)

### 공통
| 컴포넌트 | 역할 |
|---------|------|
| Header | 로고, 제목, VOD 등록 버튼 |
| Badge | Live/VOD/상태 배지 |
| Toast | 알림 토스트 |
| SubtitleItem | 자막 단일 아이템 |
| SubtitlePanel | 자막 히스토리 패널 (실시간/VOD 공용) |
| SearchInput | 키워드 검색 |
| Pagination | 페이지네이션 |

### 실시간
| 컴포넌트 | 역할 |
|---------|------|
| ChannelSelector | 18개 채널 선택 (방송 상태 표시) |
| LiveMeetingCard | 실시간 회의 상태 카드 |
| RecentVodList | 최근 VOD 목록 |
| HlsPlayer | HLS 스트리밍 재생 |

### VOD
| 컴포넌트 | 역할 |
|---------|------|
| VodTable | VOD 목록 테이블 (반응형) |
| VodRegisterModal | VOD 등록 폼 모달 (KMS URL 지원) |
| Mp4Player | MP4 재생 |
| VideoControls | 재생/일시정지, 시크바, 배속 |

---

## 커스텀 훅 (8개)

| 훅 | 역할 |
|----|------|
| useChannels | 채널 목록 조회 (SWR) |
| useChannelStatus | 채널 방송 상태 실시간 구독 (SSE) |
| useLiveMeeting | 실시간 회의 데이터 (SWR) |
| useRecentVods | 최근 VOD 목록 (SWR) |
| useSubtitleWebSocket | WebSocket 실시간 자막 수신 |
| useSubtitleSearch | 자막 키워드 검색 + 하이라이트 |
| useVodList | VOD 목록 페이지네이션 (SWR) |
| useSubtitleSync | 영상-자막 동기화 (시간 추적, 시점 이동) |

---

## 주요 컨벤션

### Frontend
- 컴포넌트: PascalCase (`LiveMeetingCard.tsx`)
- 훅: camelCase with `use` prefix (`useSubtitleSync.ts`)
- 타입: PascalCase with `Type` suffix (`MeetingType`)
- 테스트: `__tests__/` 폴더 또는 파일 옆 `*.test.tsx`

### Backend
- 모듈: snake_case (`stream_processor.py`)
- 클래스: PascalCase (`MeetingSchema`)
- 함수: snake_case (`get_live_meeting`)
- 테스트: `test_*.py` (`tests/` 폴더)

### TDD
- Phase 1+ 모든 태스크: RED -> GREEN -> REFACTOR
- 테스트 먼저 작성 후 구현

---

## 주요 기술 패턴

### Supabase REST (DB)
- `get_supabase()` FastAPI 의존성으로 클라이언트 주입
- meetings 테이블 없으면 채널 정적 데이터로 폴백
- asyncpg 미사용 (Windows 한글 사용자명 SSL 문제)

### STT 파이프라인
- Deepgram Streaming WebSocket (`wss://api.deepgram.com/v1/listen`)
- HLS 마스터 플레이리스트 → 미디어 플레이리스트 → TS 세그먼트 (2단계 파싱)
- 3개 동시 태스크: sender (세그먼트 전송), receiver (결과 수신), keepalive

### KMS VOD 변환
- `POST /api/meetings`에서 KMS URL 자동 감지 및 MP4 변환
- 패턴: `var mp4file="..."` 정규식 추출 → `https://kms.ggc.go.kr/mp4/{path}`

### WebSocket
- 단일 경로 `/ws/meetings/{meeting_id}/subtitles` (`str` 타입)
- UUID와 채널 ID (예: "ch8") 모두 지원
- `uuid.UUID` 타입 사용 금지 (Starlette가 403 반환)

---

## 환경변수

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### Backend (.env)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
DATABASE_URL=postgresql://...
```

---

## 테스트 실행

```bash
# Frontend
cd frontend && npx jest --no-coverage

# Backend
cd backend && python -m pytest -v

# 전체
cd frontend && npx jest && cd ../backend && python -m pytest
```

---

## 참조 문서

| 문서 | 경로 |
|------|------|
| PRD | `docs/planning/01-prd.md` |
| TRD | `docs/planning/02-trd.md` |
| User Flow | `docs/planning/03-user-flow.md` |
| DB 설계 | `docs/planning/04-database-design.md` |
| 디자인 시스템 | `docs/planning/05-design-system.md` |
| 화면 명세 | `docs/planning/06-screens.md` |
| 코딩 컨벤션 | `docs/planning/07-coding-convention.md` |
| 태스크 | `docs/planning/06-tasks.md` |

---

## 알려진 이슈 / 주의사항

### Frontend ESLint 규칙 (빌드 차단)
- `import/order`: 그룹 순서 = builtin(react) → external → internal(@/**) → parent/sibling → type
- `@/**` pathGroup은 `internal`로 분류됨 (같은 그룹 내 빈 줄 금지)
- `consistent-type-imports`: 타입으로만 사용되는 import는 반드시 `import type` 사용
- `no-unused-vars`: 미사용 import는 `_` 접두사 또는 제거 필요

### Next.js 14 Suspense 요구사항
- `useSearchParams()` 사용 페이지는 반드시 `<Suspense>` boundary로 감싸야 함
- `/live` 페이지: `LivePageContent` (내부) + `LivePage` (Suspense wrapper) 패턴 적용됨

### 테스트 환경
- Jest에서 `fetch`가 정의되지 않음 → live 페이지 테스트에서 `global.fetch` 모킹 필요
- `useSearchParams` mock: `jest.mock('next/navigation', ...)` 필수

### useSubtitleSync
- `videoRef.current`는 useEffect 의존성으로 부적합 (mutable ref) → `videoRef`만 사용

---

## 진행 상황

- [x] 기획 문서 완료 (01~07)
- [x] 도메인 리소스 정의 (`specs/domain/resources.yaml`)
- [x] 화면 명세 완료 (`specs/screens/*.yaml`)
- [x] 태스크 생성 완료 (`docs/planning/06-tasks.md`)
- [x] Phase 0: 프로젝트 초기화
- [x] Phase 1: 공통 인프라
- [x] Phase 2: 실시간 자막
- [x] Phase 3: VOD 자막
- [x] 채널 시스템: 18개 HLS 채널 + 상태 조회 + SSE
- [x] STT 파이프라인: Deepgram Streaming WebSocket
- [x] VOD 등록: VodRegisterModal + KMS URL 자동 변환

### 빌드 수정 이력 (2026-02-10)
- ESLint import/order, consistent-type-imports 에러 6개 수정
- `/live` 페이지 Suspense boundary 추가
- `useSubtitleSync` useEffect 의존성 경고 수정
- 프론트엔드 빌드: 통과 / 백엔드: 정상 기동 (20개 라우트)
- 테스트: 375/392 통과 (live 페이지 17개 실패 - fetch 미모킹)
