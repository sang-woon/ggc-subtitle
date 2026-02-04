import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const videoSessions = pgTable('video_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kmsUrl: text('kms_url').notNull(),
  midx: integer('midx').notNull(),
  title: text('title'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  isLive: boolean('is_live').default(true),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_sessions_midx').on(table.midx),
  index('idx_sessions_created').on(table.createdAt),
]);

export const subtitles = pgTable('subtitles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => videoSessions.id, { onDelete: 'cascade' }),
  startTimeMs: integer('start_time_ms').notNull(),
  endTimeMs: integer('end_time_ms').notNull(),
  text: text('text').notNull(),
  confidence: real('confidence'),
  seq: integer('seq'),
  isEdited: boolean('is_edited').default(false),
  originalText: text('original_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_subtitles_session').on(table.sessionId),
  index('idx_subtitles_time').on(table.sessionId, table.startTimeMs),
]);

export const subtitleEdits = pgTable('subtitle_edits', {
  id: uuid('id').primaryKey().defaultRandom(),
  subtitleId: uuid('subtitle_id')
    .notNull()
    .references(() => subtitles.id, { onDelete: 'cascade' }),
  oldText: text('old_text').notNull(),
  newText: text('new_text').notNull(),
  editedBy: text('edited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_edits_subtitle').on(table.subtitleId),
  index('idx_edits_created').on(table.createdAt),
]);

// 피드백 게시판
export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorName: text('author_name').default('익명'),
  imageUrls: text('image_urls').array(),
  status: text('status').default('pending'), // pending, reviewed, resolved
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_feedbacks_created').on(table.createdAt),
  index('idx_feedbacks_status').on(table.status),
]);

// 타입 추론용
export type VideoSession = typeof videoSessions.$inferSelect;
export type NewVideoSession = typeof videoSessions.$inferInsert;
export type SubtitleRecord = typeof subtitles.$inferSelect;
export type NewSubtitle = typeof subtitles.$inferInsert;
export type SubtitleEdit = typeof subtitleEdits.$inferSelect;
export type NewSubtitleEdit = typeof subtitleEdits.$inferInsert;
export type Feedback = typeof feedbacks.$inferSelect;
export type NewFeedback = typeof feedbacks.$inferInsert;
