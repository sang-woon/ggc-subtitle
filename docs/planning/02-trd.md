# TRD (기술 요구사항 정의서)

> 경기도의회 실시간 자막 서비스

---

## MVP 캡슐

| # | 항목 | 내용 |
|---|------|------|
| 1 | 목표 | 경기도의회 회의 영상에 실시간 자막을 제공 |
| 2 | 페르소나 | 경기도의회 직원 |
| 3 | 핵심 기능 | FEAT-1: 실시간 자막, FEAT-2: 키워드 검색, FEAT-3: VOD 자막 |
| 4 | 성공 지표 | 자막 지연 < 5초, 정확도 > 90% |
| 5 | 입력 지표 | 일일 사용 시간, 검색 빈도 |
| 6 | 비기능 요구 | 5명 동시 접속, 응답 < 2초 |
| 7 | Out-of-scope | AI 요약, 화자 기반 편집 |
| 8 | Top 리스크 | HLS 오디오 추출 실패 |
| 9 | 완화/실험 | PoC 테스트, 관리자 협조 백업 |
| 10 | 다음 단계 | HLS 스트림 오디오 추출 PoC |

---

## 1. 시스템 아키텍처

### 1.1 고수준 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Architecture                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [경기도의회 스트림]                                                     │
│       │                                                                  │
│       │ HLS (m3u8)                                                       │
│       ▼                                                                  │
│  ┌─────────────────┐                                                     │
│  │  Railway Server │                                                     │
│  │   (FastAPI)     │                                                     │
│  │                 │                                                     │
│  │  ┌───────────┐  │     ┌──────────────┐                               │
│  │  │ HLS→Audio │──┼────▶│ OpenAI API   │                               │
│  │  │ Extractor │  │     │ (Whisper)    │                               │
│  │  └───────────┘  │     └──────────────┘                               │
│  │       │         │            │                                        │
│  │       ▼         │            ▼                                        │
│  │  ┌───────────┐  │     ┌──────────────┐                               │
│  │  │ WebSocket │◀─┼─────│ 자막 텍스트  │                               │
│  │  │  Server   │  │     └──────────────┘                               │
│  │  └───────────┘  │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           │ WebSocket                                                    │
│           ▼                                                              │
│  ┌─────────────────┐     ┌──────────────┐                               │
│  │  Vercel (Next)  │────▶│  Supabase    │                               │
│  │   Frontend      │     │  (PostgreSQL)│                               │
│  └─────────────────┘     └──────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 데이터 흐름

```
1. 실시간 자막 흐름:
   HLS Stream → Audio Chunk (10초) → Whisper API → 자막 텍스트
   → 용어 교정 → WebSocket → Frontend → DB 저장

2. VOD 자막 흐름:
   MP4 URL → FFmpeg (오디오 추출) → Whisper API (배치)
   → 용어 교정 → DB 저장 → SRT/VTT 생성

3. 검색 흐름:
   검색어 입력 → Supabase Full-Text Search → 결과 하이라이트
```

### 1.3 컴포넌트 설명

| 컴포넌트 | 역할 | 왜 이 선택? |
|----------|------|-------------|
| Railway (FastAPI) | 백엔드 서버, 스트림 처리 | Long-running process 지원, WebSocket |
| Vercel (Next.js) | 프론트엔드 호스팅 | SSR 지원, 무료 티어 |
| Supabase | DB + Auth | Full-Text Search 내장, 무료 티어 |
| OpenAI Whisper | STT | 한국어 정확도 높음, API 간편 |

---

## 2. 권장 기술 스택

### 결정 방식
- **사용자 레벨**: L4 (전문가)
- **결정 방식**: 사용자 선택 + AI 추천

### 2.1 프론트엔드

| 항목 | 선택 | 이유 | 벤더 락인 리스크 |
|------|------|------|-----------------|
| 프레임워크 | Next.js 14 | SSR, App Router, 사용자 선택 | 중간 |
| 언어 | TypeScript | 타입 안전성, 자동완성 | 낮음 |
| 스타일링 | TailwindCSS | 빠른 개발, 유틸리티 기반 | 낮음 |
| 상태관리 | Zustand | 경량, 간단한 API | 낮음 |
| 영상 플레이어 | HLS.js + Video.js | HLS 스트림 지원 | 낮음 |
| 실시간 통신 | Socket.io-client | WebSocket 래퍼, 재연결 지원 | 낮음 |

### 2.2 백엔드

| 항목 | 선택 | 이유 | 벤더 락인 리스크 |
|------|------|------|-----------------|
| 프레임워크 | FastAPI | 비동기 지원, WebSocket, 자동 문서화 | 낮음 |
| 언어 | Python 3.11+ | Whisper 라이브러리 호환 | 낮음 |
| ORM | SQLAlchemy 2.0 | 표준, Supabase 호환 | 낮음 |
| 검증 | Pydantic v2 | FastAPI 통합, 타입 안전 | 낮음 |
| WebSocket | FastAPI WebSocket + socket.io | 양방향 실시간 통신 | 낮음 |
| HLS 처리 | ffmpeg-python | 오디오 추출, 청크 분리 | 낮음 |

### 2.3 데이터베이스

| 항목 | 선택 | 이유 |
|------|------|------|
| 메인 DB | Supabase (PostgreSQL) | Full-Text Search, Realtime 지원, 무료 티어 |
| 검색 | pg_trgm + to_tsvector | 한국어 Full-Text Search |

### 2.4 외부 서비스

| 항목 | 선택 | 이유 |
|------|------|------|
| STT | OpenAI Whisper API | 한국어 정확도, 간편한 API |
| 텍스트 교정 | OpenAI GPT-4o-mini | 용어 교정, 비용 효율 |

### 2.5 인프라

| 항목 | 선택 | 이유 | 비용 예상 |
|------|------|------|----------|
| 백엔드 호스팅 | Railway | Long-running 지원 | $10-20/월 |
| 프론트 호스팅 | Vercel | 무료 티어 충분 | $0 |
| DB | Supabase | 무료 티어 충분 | $0 |
| STT | OpenAI API | 사용량 기반 | $10-30/월 |

---

## 3. 비기능 요구사항

### 3.1 성능

| 항목 | 요구사항 | 측정 방법 |
|------|----------|----------|
| 자막 지연 | < 5초 (음성→표시) | 타임스탬프 비교 |
| API 응답 | < 2초 (P95) | API 모니터링 |
| 초기 로딩 | < 3초 (FCP) | Lighthouse |
| WebSocket 연결 | < 1초 | 연결 시간 측정 |

### 3.2 보안

| 항목 | 요구사항 |
|------|----------|
| 인증 | MVP: 없음 (내부 사용), v2: Supabase Auth |
| API 키 | 환경 변수, .env.local |
| HTTPS | 필수 (Railway/Vercel 기본 제공) |
| CORS | 특정 도메인만 허용 |

### 3.3 확장성

| 항목 | MVP | v2 목표 |
|------|------|---------|
| 동시 사용자 | 5명 | 50명 |
| 동시 스트림 | 1개 | 5개 |
| 저장 자막 | 100시간 | 1000시간 |

---

## 4. 외부 API 연동

### 4.1 OpenAI Whisper API

| 항목 | 내용 |
|------|------|
| 용도 | 음성→텍스트 변환 (STT) |
| 엔드포인트 | `POST /v1/audio/transcriptions` |
| 모델 | `whisper-1` |
| 파라미터 | `language: "ko"`, `response_format: "verbose_json"` |
| 제한 | 25MB/파일, 동시 요청 제한 |

**Prompt Engineering (정확도 향상):**
```
prompt: "경기도의회 회의입니다. 발언자 명단: 김철수 의원, 박영희 의원, 이민수 의원...
주요 용어: 예산안, 조례안, 본회의, 상임위원회, 결산, 추경..."
```

### 4.2 OpenAI GPT API (용어 교정)

| 항목 | 내용 |
|------|------|
| 용도 | 의회용어/의원이름 사후 교정 |
| 모델 | `gpt-4o-mini` (비용 효율) |
| 방식 | 의원이름 사전 + 용어 사전 기반 교정 |

### 4.3 경기도의회 스트림

| 항목 | 내용 |
|------|------|
| 실시간 | `https://stream01.cdn.gov-ntruss.com/live/{ch}/playlist.m3u8` |
| VOD | `https://kms.ggc.go.kr/mp4/{mp4src}` |
| API | `/getOnairListTodayData.do`, `/getQuickVodList.do` |

---

## 5. 접근제어·권한 모델

### 5.1 역할 정의 (MVP)

| 역할 | 설명 | 권한 |
|------|------|------|
| User | 내부 직원 | 전체 접근 (MVP: 인증 없음) |

### 5.2 v2 역할 정의

| 역할 | 설명 | 권한 |
|------|------|------|
| Guest | 비인증 | 접근 불가 |
| User | 일반 직원 | 실시간 시청, 검색, VOD |
| Admin | 관리자 | VOD 등록/삭제, 용어 사전 관리 |

---

## 6. 데이터 모델

### 6.1 주요 테이블

```sql
-- 회의 (Meeting)
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  meeting_date DATE NOT NULL,
  stream_url TEXT,
  vod_url TEXT,
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, live, ended
  duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 자막 (Subtitle)
CREATE TABLE subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL, -- 초 단위
  end_time FLOAT NOT NULL,
  text TEXT NOT NULL,
  speaker VARCHAR(100), -- 화자 (선택)
  confidence FLOAT, -- 인식 신뢰도
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 의원 명단 (Councilor)
CREATE TABLE councilors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  party VARCHAR(100),
  district VARCHAR(200),
  term INT, -- 대수
  is_active BOOLEAN DEFAULT true
);

-- 용어 사전 (Dictionary)
CREATE TABLE dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wrong_text VARCHAR(200) NOT NULL, -- 잘못 인식되는 텍스트
  correct_text VARCHAR(200) NOT NULL, -- 올바른 텍스트
  category VARCHAR(50), -- councilor, term, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-Text Search 인덱스
CREATE INDEX subtitles_text_search_idx ON subtitles
  USING GIN (to_tsvector('simple', text));
```

### 6.2 데이터 흐름

```
Meeting 생성 → 스트림 시작 → Subtitle 실시간 저장
                         → WebSocket 브로드캐스트
                         → Dictionary 기반 교정
```

---

## 7. API 설계

### 7.1 RESTful 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/meetings | 회의 목록 |
| GET | /api/meetings/{id} | 회의 상세 |
| POST | /api/meetings | 회의 등록 (VOD URL) |
| GET | /api/meetings/{id}/subtitles | 자막 목록 |
| GET | /api/meetings/live | 현재 실시간 회의 |
| GET | /api/search?q={keyword} | 자막 검색 |

### 7.2 WebSocket 이벤트

| 이벤트 | 방향 | 페이로드 |
|--------|------|----------|
| `connect` | C→S | `{ meeting_id }` |
| `subtitle` | S→C | `{ id, start_time, end_time, text, speaker }` |
| `meeting_status` | S→C | `{ status: "live" \| "ended" }` |

### 7.3 응답 형식

**성공:**
```json
{
  "data": { ... },
  "meta": { "total": 100, "page": 1 }
}
```

**에러:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "회의를 찾을 수 없습니다."
  }
}
```

---

## 8. 실시간 처리 파이프라인

### 8.1 HLS → Whisper 파이프라인

```python
# 의사 코드
async def process_stream(stream_url: str, meeting_id: str):
    while meeting_is_live:
        # 1. HLS 청크 다운로드 (10초 단위)
        audio_chunk = await download_hls_chunk(stream_url)

        # 2. Whisper API 호출
        transcript = await whisper_transcribe(
            audio_chunk,
            prompt=f"경기도의회 회의. 발언자: {councilor_names}"
        )

        # 3. 용어 교정
        corrected = apply_dictionary(transcript, dictionary)

        # 4. DB 저장
        subtitle = await save_subtitle(meeting_id, corrected)

        # 5. WebSocket 브로드캐스트
        await broadcast_subtitle(meeting_id, subtitle)
```

### 8.2 지연 시간 최적화

| 단계 | 예상 시간 | 최적화 방안 |
|------|----------|------------|
| HLS 청크 다운로드 | 1초 | 청크 크기 조정 (10초) |
| 오디오 추출 | 0.5초 | FFmpeg 최적화 |
| Whisper API | 2-3초 | 병렬 처리 |
| 용어 교정 | 0.2초 | 캐시 |
| 저장/브로드캐스트 | 0.3초 | 비동기 |
| **총합** | **~5초** | 목표 달성 가능 |

---

## 9. 테스트 전략

### 9.1 테스트 피라미드

| 레벨 | 도구 | 커버리지 목표 |
|------|------|-------------|
| Unit | pytest / Vitest | ≥ 70% |
| Integration | pytest + httpx | Critical paths |
| E2E | Playwright | 주요 사용자 흐름 |

### 9.2 테스트 시나리오

**핵심 시나리오:**
1. 실시간 스트림 연결 → 자막 수신
2. VOD URL 등록 → 자막 생성 → 재생
3. 키워드 검색 → 하이라이트 표시 → 시점 이동
4. 5명 동시 접속 → 자막 동기화

### 9.3 품질 게이트

- [ ] 단위 테스트 통과
- [ ] 자막 지연 < 5초
- [ ] 린트 통과 (ruff / ESLint)
- [ ] 타입 체크 통과

---

## 10. 배포 전략

### 10.1 환경

| 환경 | 용도 | URL |
|------|------|-----|
| Development | 로컬 개발 | localhost:3000, localhost:8000 |
| Preview | PR 미리보기 | Vercel Preview |
| Production | 실서비스 | TBD |

### 10.2 CI/CD

```yaml
# GitHub Actions 의사 코드
on: push
jobs:
  test:
    - lint
    - type-check
    - unit-tests
  deploy:
    needs: test
    - railway deploy (backend)
    - vercel deploy (frontend)
```

### 10.3 환경 변수

```env
# Backend (.env)
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
CORS_ORIGINS=https://...

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://api...
NEXT_PUBLIC_WS_URL=wss://api...
```

---

## Decision Log

| ID | 결정 | 선택 | 대안 | 이유 |
|----|------|------|------|------|
| D1 | STT 방식 | OpenAI API | 로컬 Whisper | GPU 없음 |
| D2 | 프론트엔드 | Next.js | React+Vite | SSR, 사용자 선택 |
| D3 | 실시간 통신 | WebSocket | SSE | 양방향 필요 가능성 |
| D4 | 호스팅 | Railway | Cloud Run | 간편한 설정 |
| D5 | DB | Supabase | PlanetScale | Full-Text Search 내장 |
