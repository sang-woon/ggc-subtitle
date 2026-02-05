# Coding Convention (코딩 컨벤션)

> 경기도의회 실시간 자막 서비스

---

## 1. 프로젝트 구조

### 1.1 전체 구조

```
project-root/
├── frontend/                 # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/              # App Router 페이지
│   │   ├── components/       # React 컴포넌트
│   │   ├── hooks/            # 커스텀 훅
│   │   ├── lib/              # 유틸리티, API 클라이언트
│   │   ├── stores/           # Zustand 스토어
│   │   └── types/            # TypeScript 타입
│   ├── public/               # 정적 파일
│   └── package.json
│
├── backend/                  # FastAPI 백엔드
│   ├── app/
│   │   ├── api/              # API 라우터
│   │   ├── core/             # 설정, 보안
│   │   ├── models/           # SQLAlchemy 모델
│   │   ├── schemas/          # Pydantic 스키마
│   │   ├── services/         # 비즈니스 로직
│   │   └── main.py           # 앱 진입점
│   ├── tests/                # 테스트
│   └── requirements.txt
│
├── contracts/                # API 계약 (BE/FE 공유)
│   └── types.ts
│
├── docs/                     # 문서
│   └── planning/
│
└── docker-compose.yml        # 로컬 개발 환경
```

### 1.2 프론트엔드 구조 상세

```
frontend/src/
├── app/                      # App Router
│   ├── layout.tsx            # 루트 레이아웃
│   ├── page.tsx              # 홈 페이지 (/)
│   ├── live/
│   │   └── page.tsx          # 실시간 뷰어 (/live)
│   └── vod/
│       ├── page.tsx          # VOD 목록 (/vod)
│       └── [id]/
│           └── page.tsx      # VOD 뷰어 (/vod/:id)
│
├── components/
│   ├── ui/                   # 기본 UI 컴포넌트
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   └── Toast.tsx
│   ├── layout/               # 레이아웃 컴포넌트
│   │   └── Header.tsx
│   ├── viewer/               # 뷰어 관련
│   │   ├── VideoPlayer.tsx
│   │   ├── SubtitlePanel.tsx
│   │   └── SubtitleItem.tsx
│   └── meeting/              # 회의 관련
│       ├── MeetingCard.tsx
│       └── VodList.tsx
│
├── hooks/
│   ├── useWebSocket.ts       # WebSocket 연결
│   ├── useSubtitles.ts       # 자막 관리
│   └── useSearch.ts          # 검색 기능
│
├── lib/
│   ├── api.ts                # API 클라이언트
│   └── utils.ts              # 유틸리티 함수
│
├── stores/
│   └── meetingStore.ts       # 회의 상태 관리
│
└── types/
    └── index.ts              # 공통 타입
```

### 1.3 백엔드 구조 상세

```
backend/app/
├── api/
│   ├── v1/
│   │   ├── router.py         # v1 라우터 통합
│   │   ├── meetings.py       # 회의 API
│   │   ├── subtitles.py      # 자막 API
│   │   └── websocket.py      # WebSocket 엔드포인트
│   └── deps.py               # 의존성 주입
│
├── core/
│   ├── config.py             # 설정 (환경변수)
│   └── security.py           # 보안 (v2)
│
├── models/
│   ├── meeting.py            # Meeting 모델
│   ├── subtitle.py           # Subtitle 모델
│   └── dictionary.py         # Dictionary 모델
│
├── schemas/
│   ├── meeting.py            # Meeting 스키마
│   └── subtitle.py           # Subtitle 스키마
│
├── services/
│   ├── stream_processor.py   # HLS 스트림 처리
│   ├── whisper_service.py    # Whisper API 연동
│   ├── correction_service.py # 용어 교정
│   └── vod_processor.py      # VOD 처리
│
└── main.py                   # FastAPI 앱
```

---

## 2. 네이밍 규칙

### 2.1 파일명

| 구분 | 규칙 | 예시 |
|------|------|------|
| React 컴포넌트 | PascalCase | `VideoPlayer.tsx` |
| 훅 | camelCase (use 접두사) | `useWebSocket.ts` |
| 유틸리티 | camelCase | `formatTime.ts` |
| Python 모듈 | snake_case | `stream_processor.py` |
| 테스트 | `*.test.ts`, `test_*.py` | `api.test.ts`, `test_meetings.py` |

### 2.2 변수/함수명

**TypeScript/JavaScript:**
```typescript
// 변수: camelCase
const meetingId = 'xxx';
const isLoading = false;

// 함수: camelCase, 동사로 시작
function fetchMeetings() { ... }
function handleClick() { ... }

// 상수: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://...';

// 컴포넌트: PascalCase
function VideoPlayer() { ... }

// 타입/인터페이스: PascalCase
interface Meeting { ... }
type SubtitleStatus = 'loading' | 'ready';
```

**Python:**
```python
# 변수: snake_case
meeting_id = 'xxx'
is_processing = False

# 함수: snake_case
def fetch_meetings():
    pass

async def process_stream():
    pass

# 상수: UPPER_SNAKE_CASE
MAX_RETRY_COUNT = 3
WHISPER_MODEL = 'whisper-1'

# 클래스: PascalCase
class StreamProcessor:
    pass

# Private: 밑줄 접두사
def _internal_method():
    pass
```

### 2.3 컴포넌트 Props

```typescript
// Props 인터페이스: 컴포넌트명 + Props
interface VideoPlayerProps {
  streamUrl: string;
  onTimeUpdate?: (time: number) => void;
}

function VideoPlayer({ streamUrl, onTimeUpdate }: VideoPlayerProps) {
  // ...
}
```

---

## 3. TypeScript 규칙

### 3.1 타입 정의

```typescript
// 인터페이스 사용 (객체 타입)
interface Meeting {
  id: string;
  title: string;
  meetingDate: string;
  status: MeetingStatus;
}

// 타입 별칭 (유니온, 간단한 타입)
type MeetingStatus = 'scheduled' | 'live' | 'processing' | 'ended';

// 제네릭 사용
interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
  };
}

// 타입 가드
function isMeeting(obj: unknown): obj is Meeting {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}
```

### 3.2 Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 3.3 Import 순서

```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. 외부 라이브러리
import { create } from 'zustand';
import clsx from 'clsx';

// 3. 내부 모듈 (절대 경로)
import { api } from '@/lib/api';
import { Meeting } from '@/types';

// 4. 컴포넌트
import { Button } from '@/components/ui/Button';

// 5. 스타일 (있는 경우)
import styles from './styles.module.css';
```

---

## 4. React 규칙

### 4.1 컴포넌트 구조

```typescript
// 컴포넌트 파일 구조
import { useState, useCallback } from 'react';

interface VideoPlayerProps {
  streamUrl: string;
  autoPlay?: boolean;
}

export function VideoPlayer({ streamUrl, autoPlay = false }: VideoPlayerProps) {
  // 1. 훅
  const [isPlaying, setIsPlaying] = useState(false);

  // 2. 핸들러
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  // 3. 사이드 이펙트
  useEffect(() => {
    // ...
  }, [streamUrl]);

  // 4. 렌더링
  return (
    <div className="video-player">
      {/* ... */}
    </div>
  );
}
```

### 4.2 훅 규칙

```typescript
// 커스텀 훅: use 접두사
function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, [url]);

  return { isConnected };
}
```

### 4.3 조건부 렌더링

```typescript
// 삼항 연산자 (간단한 경우)
{isLoading ? <Spinner /> : <Content />}

// && 연산자 (조건부 표시)
{isError && <ErrorMessage />}

// 분기가 복잡한 경우 함수 분리
function renderContent() {
  if (isLoading) return <Spinner />;
  if (isError) return <ErrorMessage />;
  return <Content data={data} />;
}

return <div>{renderContent()}</div>;
```

---

## 5. Python/FastAPI 규칙

### 5.1 API 엔드포인트

```python
from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.schemas.meeting import MeetingResponse, MeetingCreate
from app.services.meeting_service import MeetingService

router = APIRouter(prefix="/meetings", tags=["meetings"])

@router.get("/", response_model=List[MeetingResponse])
async def get_meetings(
    skip: int = 0,
    limit: int = 10,
    service: MeetingService = Depends()
):
    """회의 목록 조회"""
    return await service.get_meetings(skip=skip, limit=limit)

@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: str,
    service: MeetingService = Depends()
):
    """회의 상세 조회"""
    meeting = await service.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting
```

### 5.2 Pydantic 스키마

```python
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional

class MeetingBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    meeting_date: date

class MeetingCreate(MeetingBase):
    vod_url: Optional[str] = None

class MeetingResponse(MeetingBase):
    id: str
    status: str
    duration_seconds: Optional[int] = None

    class Config:
        from_attributes = True
```

### 5.3 서비스 클래스

```python
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate

class MeetingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_meetings(
        self,
        skip: int = 0,
        limit: int = 10
    ) -> List[Meeting]:
        result = await self.db.execute(
            select(Meeting)
            .order_by(Meeting.meeting_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create_meeting(
        self,
        meeting_data: MeetingCreate
    ) -> Meeting:
        meeting = Meeting(**meeting_data.model_dump())
        self.db.add(meeting)
        await self.db.commit()
        await self.db.refresh(meeting)
        return meeting
```

---

## 6. Git 컨벤션

### 6.1 브랜치 전략

```
main              # 프로덕션 브랜치
├── develop       # 개발 브랜치
│   ├── feature/실시간-자막        # 기능 브랜치
│   ├── feature/키워드-검색
│   └── fix/websocket-연결-오류    # 버그 수정 브랜치
```

### 6.2 커밋 메시지

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서 수정
- `style`: 코드 포맷팅
- `refactor`: 리팩토링
- `test`: 테스트 추가
- `chore`: 빌드, 설정 변경

**예시:**
```
feat(subtitle): 실시간 자막 WebSocket 연동

- HLS 스트림에서 오디오 추출
- Whisper API 연동
- WebSocket 브로드캐스트 구현

Closes #12
```

### 6.3 PR 규칙

- 제목: 커밋 메시지와 동일한 형식
- 본문: 변경 사항 요약, 테스트 방법
- 리뷰어: 최소 1명
- 머지 조건: 테스트 통과, 리뷰 승인

---

## 7. 코드 품질

### 7.1 Lint 설정

**ESLint (Frontend):**
```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

**Ruff (Backend):**
```toml
# pyproject.toml
[tool.ruff]
line-length = 100
select = ["E", "F", "I", "N", "W"]

[tool.ruff.isort]
known-first-party = ["app"]
```

### 7.2 포맷터

- Frontend: Prettier
- Backend: Black + isort

### 7.3 Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: frontend-lint
        name: Frontend Lint
        entry: npm run lint
        language: system
        files: ^frontend/

      - id: backend-lint
        name: Backend Lint
        entry: ruff check
        language: system
        files: ^backend/
```

---

## 8. 주석 규칙

### 8.1 필요한 경우에만 주석

```typescript
// ❌ 불필요한 주석
// 회의 ID
const meetingId = meeting.id;

// ✅ 필요한 주석: 비즈니스 로직 설명
// HLS 청크는 10초 단위로 처리됨 (Whisper API 최적화)
const CHUNK_DURATION = 10;
```

### 8.2 TODO/FIXME

```typescript
// TODO: v2에서 화자 분리 기능 추가
// FIXME: WebSocket 재연결 시 자막 중복 발생
```

---

## 9. 테스트 규칙

### 9.1 테스트 파일 위치

```
frontend/
├── src/
│   └── components/
│       └── VideoPlayer.tsx
└── tests/
    └── components/
        └── VideoPlayer.test.tsx

backend/
├── app/
│   └── services/
│       └── whisper_service.py
└── tests/
    └── services/
        └── test_whisper_service.py
```

### 9.2 테스트 네이밍

```typescript
// TypeScript
describe('VideoPlayer', () => {
  it('should render video element with correct source', () => {});
  it('should call onTimeUpdate when video time changes', () => {});
});
```

```python
# Python
class TestWhisperService:
    async def test_transcribe_audio_returns_text(self):
        pass

    async def test_transcribe_audio_with_prompt_improves_accuracy(self):
        pass
```

---

## 10. 환경 변수

### 10.1 네이밍

```env
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com

# Backend (.env)
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
CORS_ORIGINS=https://example.com
```

### 10.2 접근 방법

```typescript
// Frontend
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

```python
# Backend
from app.core.config import settings

api_key = settings.OPENAI_API_KEY
```
