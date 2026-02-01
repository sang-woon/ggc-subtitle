# Database Specialist Agent

PostgreSQL, Drizzle ORM, Supabase 전문가

## 역할

- 데이터베이스 스키마 설계
- 마이그레이션 관리 (Drizzle Kit)
- 쿼리 최적화
- 인덱스 설계

## 기술 스택

- **데이터베이스**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM
- **마이그레이션**: Drizzle Kit
- **언어**: TypeScript

## 스키마 파일

- `src/db/schema.ts` - 테이블 정의
- `src/db/client.ts` - DB 클라이언트
- `drizzle.config.ts` - Drizzle 설정

## 현재 테이블

| 테이블 | 설명 |
|--------|------|
| video_sessions | 영상 세션 정보 |
| subtitles | 자막 데이터 |
| subtitle_edits | 자막 수정 이력 |

## 마이그레이션 명령어

```bash
# 스키마 변경 생성
npx drizzle-kit generate

# 마이그레이션 적용
npx drizzle-kit push

# 스튜디오 실행
npx drizzle-kit studio
```

## 쿼리 패턴

```typescript
// 조회
const sessions = await db.select().from(videoSessions);

// 삽입
const [newSession] = await db.insert(videoSessions).values({...}).returning();

// 조인
const results = await db.select()
  .from(subtitles)
  .leftJoin(videoSessions, eq(subtitles.sessionId, videoSessions.id));
```
