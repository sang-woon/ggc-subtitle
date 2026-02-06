# CLAUDE.md - 경기도의회 실시간 자막 서비스

> AI 코딩 어시스턴트를 위한 프로젝트 컨텍스트

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **서비스명** | 경기도의회 실시간 자막 서비스 |
| **목적** | 의회 회의 영상에 실시간/VOD 자막 제공 |
| **핵심 기술** | OpenAI Whisper API, WebSocket, HLS 스트리밍 |
| **상태** | 전체 구현 완료 (Phase 0~3) |

---

## 기술 스택

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS
- **State**: SWR
- **Video**: HLS.js (실시간), HTML5 Video (VOD)
- **Test**: Jest + React Testing Library (393 tests)

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database**: PostgreSQL (Supabase)
- **Realtime**: WebSocket (FastAPI)
- **STT**: OpenAI Whisper API / Deepgram Nova-3
- **Test**: pytest (128 tests)

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway
- **Database**: Supabase
- **External**: 경기도의회 HLS 스트림

---

## 프로젝트 구조

```
/
├── frontend/                   # Next.js 14
│   ├── src/
│   │   ├── app/               # App Router (페이지)
│   │   │   ├── page.tsx       # 홈 대시보드 (/)
│   │   │   ├── live/          # 실시간 뷰어 (/live)
│   │   │   └── vod/           # VOD (/vod, /vod/[id])
│   │   ├── components/        # UI 컴포넌트 (15개)
│   │   ├── hooks/             # 커스텀 훅 (6개)
│   │   ├── lib/               # API 클라이언트, Supabase
│   │   ├── types/             # TypeScript 타입
│   │   └── utils/             # 유틸리티 (highlight 등)
│   ├── e2e/                   # E2E 테스트 (Playwright)
│   └── package.json
│
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── api/               # REST API + WebSocket
│   │   │   ├── meetings.py    # 회의 CRUD
│   │   │   ├── subtitles.py   # 자막 조회/검색
│   │   │   └── websocket.py   # 실시간 자막 WS
│   │   ├── core/              # 설정, DB 연결
│   │   ├── models/            # SQLAlchemy 모델
│   │   ├── schemas/           # Pydantic 스키마
│   │   ├── services/          # 비즈니스 로직
│   │   │   ├── whisper.py     # Whisper STT
│   │   │   ├── deepgram_stt.py # Deepgram STT
│   │   │   ├── stream_processor.py # HLS 처리
│   │   │   ├── vod_processor.py    # VOD 자막 생성
│   │   │   └── dictionary.py  # 용어 사전
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
  - GET /api/meetings           # 목록 (status, page, per_page)
  - GET /api/meetings/live      # 실시간 회의
  - GET /api/meetings/{id}      # 상세
  - POST /api/meetings          # VOD 등록

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
  - WS /ws/meetings/{id}/subtitles          # 실시간

fields:
  - id, meeting_id, start_time, end_time
  - text, speaker, confidence
```

---

## 화면 구조

| ID | 화면 | 경로 | 핵심 기능 |
|----|------|------|-----------|
| S-01 | 홈 대시보드 | `/` | 실시간 회의 상태, 최근 VOD, VOD 등록 |
| S-02 | 실시간 뷰어 | `/live` | HLS 스트리밍 + WebSocket 자막 |
| S-03 | VOD 목록 | `/vod` | VOD 테이블, 페이지네이션 |
| S-04 | VOD 뷰어 | `/vod/:id` | MP4 재생 + 자막 동기화 + 배속 |
| M-01 | VOD 등록 모달 | - | 폼 유효성 검사 + VOD URL 등록 |

---

## 컴포넌트 맵

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

### 실시간 (Phase 2)
| 컴포넌트 | 역할 |
|---------|------|
| LiveMeetingCard | 실시간 회의 상태 카드 |
| RecentVodList | 최근 VOD 목록 |
| HlsPlayer | HLS 스트리밍 재생 |

### VOD (Phase 3)
| 컴포넌트 | 역할 |
|---------|------|
| VodTable | VOD 목록 테이블 (반응형) |
| VodRegisterModal | VOD 등록 폼 모달 |
| Mp4Player | MP4 재생 |
| VideoControls | 재생/일시정지, 시크바, 배속 |

---

## 커스텀 훅

| 훅 | 역할 |
|----|------|
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
# Frontend (393 tests)
cd frontend && npx jest --no-coverage

# Backend (128 tests)
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

## 진행 상황

- [x] 기획 문서 완료 (01~07)
- [x] 도메인 리소스 정의 (`specs/domain/resources.yaml`)
- [x] 화면 명세 완료 (`specs/screens/*.yaml`)
- [x] 태스크 생성 완료 (`docs/planning/06-tasks.md`)
- [x] Phase 0: 프로젝트 초기화
- [x] Phase 1: 공통 인프라
- [x] Phase 2: 실시간 자막
- [x] Phase 3: VOD 자막
