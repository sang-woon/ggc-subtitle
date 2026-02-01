-- 영상 세션 테이블
CREATE TABLE IF NOT EXISTS video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kms_url TEXT NOT NULL,
  midx INTEGER NOT NULL,
  title TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_live BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('active', 'ended', 'error'))
);

-- 자막 테이블
CREATE TABLE IF NOT EXISTS subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES video_sessions(id) ON DELETE CASCADE,
  start_time_ms INTEGER NOT NULL,
  end_time_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  seq INTEGER,
  is_edited BOOLEAN DEFAULT false,
  original_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (end_time_ms >= start_time_ms),
  CONSTRAINT valid_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

-- 자막 수정 이력 테이블
CREATE TABLE IF NOT EXISTS subtitle_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtitle_id UUID NOT NULL REFERENCES subtitles(id) ON DELETE CASCADE,
  old_text TEXT NOT NULL,
  new_text TEXT NOT NULL,
  edited_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_sessions_midx ON video_sessions(midx);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON video_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON video_sessions(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subtitles_session ON subtitles(session_id);
CREATE INDEX IF NOT EXISTS idx_subtitles_time ON subtitles(session_id, start_time_ms);
CREATE INDEX IF NOT EXISTS idx_subtitles_text_search ON subtitles USING gin(to_tsvector('simple', text));

CREATE INDEX IF NOT EXISTS idx_edits_subtitle ON subtitle_edits(subtitle_id);
CREATE INDEX IF NOT EXISTS idx_edits_created ON subtitle_edits(created_at DESC);
