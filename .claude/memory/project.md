# Project Memory

## 기본 정보
- 프로젝트명: ggc-subtitle (경기도의회 실시간 자막 시스템)
- 기술 스택: Next.js 16 + React 19 + Drizzle ORM + PostgreSQL (Supabase)
- 시작일: 2026-02-01

## 아키텍처
- 백엔드: Next.js API Routes
- 프론트엔드: React 19 + TailwindCSS
- 데이터베이스: PostgreSQL (Supabase)
- 외부 API: RTZR STT API

## 특이사항
- 인증: 없음 (내부 시연용)
- MCP: Context7 + Playwright + Gemini + GitHub
- 실시간 STT: HTTP 배치 모드 (브라우저 WebSocket 제한으로 인해)

## 주요 의존성
- hls.js: HLS 스트리밍 재생
- ws: 서버 측 WebSocket
- drizzle-orm: TypeScript ORM
- @supabase/supabase-js: Supabase 클라이언트
