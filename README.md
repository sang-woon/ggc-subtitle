# 경기도의회 실시간 자막 서비스

경기도의회 회의 영상에 AI 음성 인식 기반 실시간/VOD 자막을 제공하는 웹 서비스입니다.

## 주요 기능

- **실시간 자막**: 18개 HLS 채널 스트리밍 + WebSocket 기반 실시간 자막
- **STT 파이프라인**: Deepgram Nova-3 Streaming WebSocket으로 HLS TS 세그먼트 실시간 변환
- **채널 상태**: 방송 상태 실시간 조회 (SSE 스트림)
- **VOD 자막**: MP4 영상에 자막 동기화, 배속 재생, 시점 이동
- **VOD 등록**: KMS VOD URL 자동 MP4 변환 지원
- **자막 검색**: 키워드 기반 자막 검색 및 하이라이트
- **의회 용어 최적화**: 의원 이름/의회 용어 사전 기반 STT 정확도 향상

## 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | Next.js 14, TypeScript, TailwindCSS, SWR, HLS.js |
| Backend | FastAPI, Python 3.11+, WebSocket, httpx |
| Database | Supabase (REST API) |
| STT | Deepgram Nova-3 (Streaming) / OpenAI Whisper API |
| Infrastructure | Vercel (FE), Railway (BE), Supabase (DB) |

## 화면 구성

| 경로 | 화면 | 설명 |
|------|------|------|
| `/` | 홈 대시보드 | 실시간 회의 상태, 최근 VOD 목록, VOD 등록 모달 |
| `/live` | 실시간 뷰어 | 채널 선택 + HLS 영상 + 실시간 자막 (WebSocket) |
| `/vod` | VOD 목록 | VOD 테이블, 페이지네이션 |
| `/vod/:id` | VOD 뷰어 | MP4 영상 + 자막 동기화 + 배속 컨트롤 |

## 시작하기

### 사전 요구사항

- Node.js 18+
- Python 3.11+
- Supabase 프로젝트 (PostgreSQL)

### 1. 저장소 클론

```bash
git clone <repository-url>
cd 260205-subsrcript
```

### 2. Backend 설정

```bash
cd backend
pip install -r requirements.txt

# 환경변수 설정
cp .env.example .env
# .env 파일에 다음 값 입력:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_KEY=your-service-role-key
#   OPENAI_API_KEY=sk-...
#   DEEPGRAM_API_KEY=...
#   DATABASE_URL=postgresql://...
```

### 3. Frontend 설정

```bash
cd frontend
npm install

# 환경변수 설정
cp .env.local.example .env.local
# .env.local 파일에 다음 값 입력:
#   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
#   NEXT_PUBLIC_API_URL=http://localhost:8000
#   NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### 4. 데이터베이스 마이그레이션

Supabase 대시보드의 SQL Editor에서 실행:
1. `backend/migrations/001_initial.sql`
2. `backend/migrations/002_adapt_existing_schema.sql` (기존 테이블 적응)

### 5. 서버 실행

```bash
# Backend (터미널 1)
cd backend
uvicorn app.main:app --reload --port 8000

# Frontend (터미널 2)
cd frontend
npm run dev
```

브라우저에서 http://localhost:3000 접속

## 테스트

```bash
# Frontend 테스트
cd frontend
npx jest

# Backend 테스트
cd backend
python -m pytest -v

# Frontend 커버리지
cd frontend
npx jest --coverage
```

## API 엔드포인트

### Meetings

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/meetings` | 회의 목록 (status, limit, offset) |
| GET | `/api/meetings/live` | 실시간 회의 조회 (channel 파라미터) |
| GET | `/api/meetings/{id}` | 회의 상세 (채널 ID도 지원) |
| POST | `/api/meetings` | VOD 등록 (KMS URL 자동 MP4 변환) |

### Subtitles

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/meetings/{id}/subtitles` | 자막 목록 |
| GET | `/api/meetings/{id}/subtitles/search` | 자막 검색 |
| WS | `/ws/meetings/{id}/subtitles` | 실시간 자막 스트림 |

### Channels

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/channels` | 전체 채널 목록 (18개) |
| GET | `/api/channels/status` | 채널 + 실시간 방송 상태 |
| GET | `/api/channels/status/stream` | SSE 실시간 상태 스트림 |
| GET | `/api/channels/{id}` | 채널 상세 |
| POST | `/api/channels/{id}/stt/start` | 채널 STT 시작 |
| POST | `/api/channels/{id}/stt/stop` | 채널 STT 중지 |
| GET | `/api/channels/{id}/stt/status` | 채널 STT 상태 |

### Utility

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 서비스 상태 |
| GET | `/health` | 헬스체크 |

## 채널 목록

| 채널 ID | 위원회 |
|---------|--------|
| ch14 | 본회의 |
| ch1 | 의회운영위원회 |
| ch3 | 기획재정위원회 |
| ch6 | 경제노동위원회 |
| ch7 | 안전행정위원회 |
| ch8 | 문화체육관광위원회 |
| ch15 | 농정해양위원회 |
| ch2 | 보건복지위원회 |
| ch12 | 건설교통위원회 |
| ch13 | 도시환경위원회 |
| ch16 | 미래과학협력위원회 |
| ch11 | 여성가족평생교육위원회 |
| ch4 | 교육기획위원회 |
| ch5 | 교육행정위원회 |
| ch60 | 경기도청 예산결산특별위원회 |
| ch61 | 경기도교육청 예산결산특별위원회 |
| ch10 | 행정사무조사 |
| ch90 | 도의회 북부분원 |

## 프로젝트 구조

```
/
├── frontend/                   # Next.js 14 (App Router)
│   ├── src/
│   │   ├── app/               # 페이지 (/, /live, /vod, /vod/[id])
│   │   ├── components/        # UI 컴포넌트 (15개)
│   │   ├── hooks/             # 커스텀 훅 (8개)
│   │   ├── lib/               # API 클라이언트
│   │   ├── types/             # TypeScript 타입
│   │   └── utils/             # 유틸리티
│   └── e2e/                   # E2E 테스트
│
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── api/               # REST + WebSocket + SSE 라우터
│   │   ├── core/              # 설정, DB, 채널 설정
│   │   ├── models/            # ORM 모델 (stub)
│   │   ├── schemas/           # 요청/응답 스키마
│   │   ├── services/          # STT, 스트림, VOD, KMS 변환
│   │   └── tasks/             # 백그라운드 작업
│   ├── tests/                 # 테스트
│   └── migrations/            # SQL 마이그레이션
│
├── specs/                     # 도메인/화면 명세
└── docs/planning/             # 기획 문서
```

## 배포

### Frontend (Vercel)

```bash
cd frontend
vercel deploy
```

### Backend (Railway)

Railway 대시보드에서 `backend/` 디렉토리를 연결하고 환경변수를 설정합니다.

## 기획 문서

| 문서 | 설명 |
|------|------|
| [PRD](docs/planning/01-prd.md) | 제품 요구사항 정의 |
| [TRD](docs/planning/02-trd.md) | 기술 요구사항 정의 |
| [User Flow](docs/planning/03-user-flow.md) | 사용자 흐름 |
| [DB 설계](docs/planning/04-database-design.md) | 데이터베이스 스키마 |
| [디자인 시스템](docs/planning/05-design-system.md) | UI/UX 가이드 |
| [화면 명세](docs/planning/06-screens.md) | 화면별 상세 스펙 |
| [코딩 컨벤션](docs/planning/07-coding-convention.md) | 코드 스타일 가이드 |

## 라이선스

이 프로젝트는 경기도의회를 위해 개발되었습니다.
