-- live_sessions 테이블 생성 (Leader Election 패턴용)
CREATE TABLE IF NOT EXISTS "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_code" text NOT NULL,
	"leader_id" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_heartbeat" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "live_sessions_channel_code_unique" UNIQUE("channel_code")
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS "idx_live_sessions_channel" ON "live_sessions" USING btree ("channel_code");
CREATE INDEX IF NOT EXISTS "idx_live_sessions_active" ON "live_sessions" USING btree ("is_active");

-- Supabase Realtime 활성화 (자막 브로드캐스트용)
ALTER PUBLICATION supabase_realtime ADD TABLE "live_sessions";
