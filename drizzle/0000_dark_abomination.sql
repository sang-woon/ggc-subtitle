CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"author_name" text DEFAULT '익명',
	"image_urls" text[],
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_code" text NOT NULL,
	"leader_id" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_heartbeat" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "live_sessions_channel_code_unique" UNIQUE("channel_code")
);
--> statement-breakpoint
CREATE TABLE "subtitle_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtitle_id" uuid NOT NULL,
	"old_text" text NOT NULL,
	"new_text" text NOT NULL,
	"edited_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subtitles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"start_time_ms" integer NOT NULL,
	"end_time_ms" integer NOT NULL,
	"text" text NOT NULL,
	"confidence" real,
	"seq" integer,
	"is_edited" boolean DEFAULT false,
	"original_text" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "video_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kms_url" text NOT NULL,
	"midx" integer NOT NULL,
	"title" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"is_live" boolean DEFAULT true,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "subtitle_edits" ADD CONSTRAINT "subtitle_edits_subtitle_id_subtitles_id_fk" FOREIGN KEY ("subtitle_id") REFERENCES "public"."subtitles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitles" ADD CONSTRAINT "subtitles_session_id_video_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feedbacks_created" ON "feedbacks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_feedbacks_status" ON "feedbacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_channel" ON "live_sessions" USING btree ("channel_code");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_active" ON "live_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_edits_subtitle" ON "subtitle_edits" USING btree ("subtitle_id");--> statement-breakpoint
CREATE INDEX "idx_edits_created" ON "subtitle_edits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_subtitles_session" ON "subtitles" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_subtitles_time" ON "subtitles" USING btree ("session_id","start_time_ms");--> statement-breakpoint
CREATE INDEX "idx_sessions_midx" ON "video_sessions" USING btree ("midx");--> statement-breakpoint
CREATE INDEX "idx_sessions_created" ON "video_sessions" USING btree ("created_at");