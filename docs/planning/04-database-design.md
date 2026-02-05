# Database Design (데이터베이스 설계)

> 경기도의회 실시간 자막 서비스

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| DBMS | PostgreSQL (Supabase) |
| 주요 기능 | Full-Text Search, Realtime |
| 테이블 수 | 4개 (MVP) |

---

## 2. ERD (Entity-Relationship Diagram)

```
┌─────────────────┐       ┌─────────────────┐
│    meetings     │       │    subtitles    │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │───┐   │ id (PK)         │
│ title           │   │   │ meeting_id (FK) │──┐
│ meeting_date    │   └──▶│ start_time      │  │
│ stream_url      │       │ end_time        │  │
│ vod_url         │       │ text            │  │
│ status          │       │ speaker         │  │
│ duration_seconds│       │ confidence      │  │
│ created_at      │       │ created_at      │  │
│ updated_at      │       └─────────────────┘  │
└─────────────────┘                            │
                                               │
┌─────────────────┐       ┌─────────────────┐  │
│   councilors    │       │   dictionary    │  │
├─────────────────┤       ├─────────────────┤  │
│ id (PK)         │       │ id (PK)         │  │
│ name            │       │ wrong_text      │  │
│ party           │       │ correct_text    │  │
│ district        │       │ category        │  │
│ term            │       │ created_at      │  │
│ is_active       │       └─────────────────┘  │
└─────────────────┘                            │
                                               │
                    ┌──────────────────────────┘
                    │ 1:N (One Meeting : Many Subtitles)
```

---

## 3. 테이블 상세

### 3.1 meetings (회의)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 고유 식별자 |
| title | VARCHAR(255) | NOT NULL | 회의 제목 |
| meeting_date | DATE | NOT NULL | 회의 날짜 |
| stream_url | TEXT | NULL | 실시간 스트림 URL |
| vod_url | TEXT | NULL | VOD URL |
| status | VARCHAR(20) | DEFAULT 'scheduled' | 상태 (scheduled, live, ended) |
| duration_seconds | INT | NULL | 총 재생 시간 (초) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 수정 시각 |

**인덱스:**
- `idx_meetings_status` ON (status)
- `idx_meetings_date` ON (meeting_date DESC)

**SQL:**
```sql
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  meeting_date DATE NOT NULL,
  stream_url TEXT,
  vod_url TEXT,
  status VARCHAR(20) DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'processing', 'ended')),
  duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_date ON meetings(meeting_date DESC);

-- Updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### 3.2 subtitles (자막)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 고유 식별자 |
| meeting_id | UUID | FK → meetings(id), ON DELETE CASCADE | 회의 FK |
| start_time | FLOAT | NOT NULL | 시작 시간 (초) |
| end_time | FLOAT | NOT NULL | 종료 시간 (초) |
| text | TEXT | NOT NULL | 자막 텍스트 |
| speaker | VARCHAR(100) | NULL | 화자 (선택) |
| confidence | FLOAT | NULL | 인식 신뢰도 (0~1) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성 시각 |

**인덱스:**
- `idx_subtitles_meeting_time` ON (meeting_id, start_time)
- `idx_subtitles_text_search` USING GIN (to_tsvector('simple', text))

**SQL:**
```sql
CREATE TABLE subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  text TEXT NOT NULL,
  speaker VARCHAR(100),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 복합 인덱스: 회의 내 자막 조회 최적화
CREATE INDEX idx_subtitles_meeting_time ON subtitles(meeting_id, start_time);

-- Full-Text Search 인덱스 (한국어)
-- 'simple' 설정은 형태소 분석 없이 공백 기준 토큰화
CREATE INDEX idx_subtitles_text_search ON subtitles
  USING GIN (to_tsvector('simple', text));

-- trigram 인덱스 (부분 문자열 검색)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_subtitles_text_trgm ON subtitles
  USING GIN (text gin_trgm_ops);
```

---

### 3.3 councilors (의원 명단)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 고유 식별자 |
| name | VARCHAR(100) | NOT NULL | 의원 이름 |
| party | VARCHAR(100) | NULL | 소속 정당 |
| district | VARCHAR(200) | NULL | 지역구 |
| term | INT | NULL | 대수 (예: 11) |
| is_active | BOOLEAN | DEFAULT true | 현역 여부 |

**SQL:**
```sql
CREATE TABLE councilors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  party VARCHAR(100),
  district VARCHAR(200),
  term INT,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_councilors_name ON councilors(name);
CREATE INDEX idx_councilors_active ON councilors(is_active) WHERE is_active = true;
```

---

### 3.4 dictionary (용어 사전)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 고유 식별자 |
| wrong_text | VARCHAR(200) | NOT NULL | 잘못 인식되는 텍스트 |
| correct_text | VARCHAR(200) | NOT NULL | 올바른 텍스트 |
| category | VARCHAR(50) | NULL | 분류 (councilor, term, etc.) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성 시각 |

**SQL:**
```sql
CREATE TABLE dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wrong_text VARCHAR(200) NOT NULL,
  correct_text VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wrong_text)
);

CREATE INDEX idx_dictionary_wrong ON dictionary(wrong_text);
CREATE INDEX idx_dictionary_category ON dictionary(category);
```

---

## 4. 주요 쿼리

### 4.1 실시간 회의 조회

```sql
-- 현재 실시간 진행 중인 회의
SELECT *
FROM meetings
WHERE status = 'live'
ORDER BY meeting_date DESC
LIMIT 1;
```

### 4.2 자막 검색 (Full-Text Search)

```sql
-- 키워드 검색 (trigram 사용)
SELECT s.*, m.title as meeting_title
FROM subtitles s
JOIN meetings m ON s.meeting_id = m.id
WHERE s.text ILIKE '%예산%'
ORDER BY s.start_time;

-- Full-Text Search 버전
SELECT s.*, m.title as meeting_title,
       ts_rank(to_tsvector('simple', s.text), plainto_tsquery('simple', '예산')) as rank
FROM subtitles s
JOIN meetings m ON s.meeting_id = m.id
WHERE to_tsvector('simple', s.text) @@ plainto_tsquery('simple', '예산')
ORDER BY rank DESC, s.start_time;
```

### 4.3 회의별 자막 조회

```sql
-- 특정 회의의 모든 자막 (시간순)
SELECT *
FROM subtitles
WHERE meeting_id = $1
ORDER BY start_time;

-- 페이지네이션
SELECT *
FROM subtitles
WHERE meeting_id = $1
ORDER BY start_time
LIMIT 100 OFFSET 0;
```

### 4.4 용어 교정 적용

```sql
-- 교정 사전 기반 텍스트 교정
WITH corrections AS (
  SELECT wrong_text, correct_text
  FROM dictionary
  ORDER BY LENGTH(wrong_text) DESC  -- 긴 것부터 교정 (부분 매칭 방지)
)
SELECT
  id,
  meeting_id,
  start_time,
  end_time,
  -- 교정 적용 (애플리케이션 레벨에서 처리 권장)
  text as original_text
FROM subtitles
WHERE meeting_id = $1;
```

### 4.5 의원 명단 조회

```sql
-- 현역 의원 명단 (Whisper prompt용)
SELECT name
FROM councilors
WHERE is_active = true
  AND term = 11
ORDER BY name;
```

---

## 5. 데이터 흐름

### 5.1 실시간 자막 저장

```
1. HLS 스트림에서 오디오 청크 추출
2. Whisper API로 텍스트 변환
3. Dictionary 기반 용어 교정
4. subtitles 테이블에 INSERT
5. WebSocket으로 클라이언트에 브로드캐스트
```

### 5.2 VOD 자막 생성

```
1. VOD URL로 meetings 레코드 생성 (status: 'processing')
2. MP4에서 오디오 추출
3. Whisper API로 전체 텍스트 변환
4. Dictionary 기반 용어 교정
5. subtitles 테이블에 배치 INSERT
6. meetings 상태 업데이트 (status: 'ended')
```

---

## 6. Supabase 설정

### 6.1 Row Level Security (RLS)

MVP에서는 인증 없이 사용하므로 RLS 비활성화:

```sql
-- MVP: RLS 비활성화 (내부 사용)
ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;
ALTER TABLE subtitles DISABLE ROW LEVEL SECURITY;
ALTER TABLE councilors DISABLE ROW LEVEL SECURITY;
ALTER TABLE dictionary DISABLE ROW LEVEL SECURITY;
```

### 6.2 Realtime 설정

```sql
-- subtitles 테이블에 Realtime 활성화 (자막 실시간 푸시용)
ALTER PUBLICATION supabase_realtime ADD TABLE subtitles;
```

---

## 7. 마이그레이션

### 7.1 초기 마이그레이션

```sql
-- migrations/001_initial.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tables
CREATE TABLE meetings ( ... );
CREATE TABLE subtitles ( ... );
CREATE TABLE councilors ( ... );
CREATE TABLE dictionary ( ... );

-- Indexes
CREATE INDEX ...;

-- Triggers
CREATE TRIGGER ...;
```

### 7.2 시드 데이터

```sql
-- seeds/001_councilors.sql

-- 11대 경기도의회 의원 명단 (예시)
INSERT INTO councilors (name, party, district, term, is_active) VALUES
  ('김철수', '더불어민주당', '수원시 가선거구', 11, true),
  ('박영희', '국민의힘', '성남시 가선거구', 11, true),
  -- ... 실제 의원 명단
  ;

-- seeds/002_dictionary.sql

-- 의회 용어 사전
INSERT INTO dictionary (wrong_text, correct_text, category) VALUES
  ('예쌨안', '예산안', 'term'),
  ('조려안', '조례안', 'term'),
  ('본희의', '본회의', 'term'),
  ('상임이', '상임위', 'term'),
  ('추견', '추경', 'term'),
  -- ... 추가 용어
  ;
```

---

## 8. 백업 및 복구

### 8.1 Supabase 자동 백업

- Supabase Pro 플랜: 일일 자동 백업
- Free 플랜: 수동 백업 필요

### 8.2 수동 백업

```bash
# pg_dump를 사용한 백업
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

---

## 9. 성능 고려사항

### 9.1 인덱스 전략

| 쿼리 패턴 | 인덱스 |
|----------|--------|
| 회의 상태 조회 | idx_meetings_status |
| 회의 날짜순 정렬 | idx_meetings_date |
| 회의별 자막 시간순 | idx_subtitles_meeting_time |
| 자막 전문 검색 | idx_subtitles_text_search |
| 자막 부분 검색 | idx_subtitles_text_trgm |

### 9.2 파티셔닝 (v2)

자막 데이터가 많아지면 월별 파티셔닝 고려:

```sql
-- v2: 월별 파티셔닝
CREATE TABLE subtitles (
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE subtitles_2026_01 PARTITION OF subtitles
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```
