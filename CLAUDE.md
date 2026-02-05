# CLAUDE.md - 경기도의회 실시간 자막 서비스

> AI 코딩 어시스턴트를 위한 프로젝트 컨텍스트

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **서비스명** | 경기도의회 실시간 자막 서비스 |
| **목적** | 의회 회의 영상에 실시간/VOD 자막 제공 |
| **핵심 기술** | OpenAI Whisper API, WebSocket, HLS 스트리밍 |

---

## 기술 스택

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS
- **State**: SWR / React Query
- **Video**: HLS.js (실시간), HTML5 Video (VOD)

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database**: PostgreSQL (Supabase)
- **Realtime**: WebSocket (FastAPI)
- **STT**: OpenAI Whisper API

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway
- **Database**: Supabase
- **External**: 경기도의회 HLS 스트림

---

## 프로젝트 구조

```
/
├── frontend/                 # Next.js 14
│   ├── src/
│   │   ├── app/             # App Router
│   │   │   ├── page.tsx     # 홈 (/)
│   │   │   ├── live/        # 실시간 뷰어 (/live)
│   │   │   └── vod/         # VOD (/vod, /vod/[id])
│   │   ├── components/      # 공통 컴포넌트
│   │   ├── hooks/           # 커스텀 훅
│   │   ├── lib/             # 유틸리티
│   │   └── types/           # TypeScript 타입
│   └── package.json
│
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/             # API 라우트
│   │   ├── core/            # 설정, DB
│   │   ├── models/          # SQLAlchemy 모델
│   │   ├── schemas/         # Pydantic 스키마
│   │   └── services/        # 비즈니스 로직
│   ├── tests/               # 테스트
│   └── requirements.txt
│
├── specs/                    # 화면/도메인 명세
│   ├── domain/
│   │   └── resources.yaml   # API 리소스 정의
│   ├── screens/             # 화면별 YAML 명세
│   └── shared/              # 공통 타입/컴포넌트
│
└── docs/planning/           # 기획 문서
```

---

## 핵심 도메인 리소스

### meetings
```yaml
endpoints:
  - GET /api/meetings           # 목록
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
| S-01 | 홈 대시보드 | `/` | 실시간 회의 상태, VOD 목록 |
| S-02 | 실시간 뷰어 | `/live` | HLS 스트리밍 + WebSocket 자막 |
| S-03 | VOD 목록 | `/vod` | VOD 목록, 페이지네이션 |
| S-04 | VOD 뷰어 | `/vod/:id` | MP4 재생 + 자막 동기화 |
| M-01 | VOD 등록 모달 | - | VOD URL 등록 |

---

## 주요 컨벤션

### Frontend
- 컴포넌트: PascalCase (`LiveMeetingCard.tsx`)
- 훅: camelCase with `use` prefix (`useSubtitleSync.ts`)
- 타입: PascalCase with `Type` suffix (`MeetingType`)
- 테스트: `*.test.tsx` (컴포넌트 옆)

### Backend
- 모듈: snake_case (`stream_processor.py`)
- 클래스: PascalCase (`MeetingSchema`)
- 함수: snake_case (`get_live_meeting`)
- 테스트: `test_*.py` (`tests/` 폴더)

### TDD
- Phase 1+ 모든 태스크: RED → GREEN → REFACTOR
- 테스트 먼저 작성 후 구현

---

## 환경변수

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### Backend (.env)
```
SUPABASE_URL=
SUPABASE_KEY=
OPENAI_API_KEY=
DATABASE_URL=
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

## 현재 진행 상황

- [x] 기획 문서 완료 (01~07)
- [x] 도메인 리소스 정의 (`specs/domain/resources.yaml`)
- [x] 화면 명세 완료 (`specs/screens/*.yaml`)
- [x] 태스크 생성 완료 (`docs/planning/06-tasks.md`)
- [ ] Phase 0: 프로젝트 초기화
- [ ] Phase 1: 공통 인프라
- [ ] Phase 2: 실시간 자막
- [ ] Phase 3: VOD 자막
