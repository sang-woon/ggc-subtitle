# TASKS.md - Phase 5: 고도화 기능

> 소스: `docs/planning/08-feature-tasks.md`
> 기술 스택: FastAPI + Next.js 14 + Supabase

---

## Phase 5-A: 화자 식별 + 자막 교정

### Feature 1: 화자 식별 (Speaker Diarization)

- [x] **P5-T1.1**: VOD STT에 diarization 활성화 `담당: backend-specialist`
  - `backend/app/services/deepgram_stt.py` 수정
  - `transcribe()`에 `diarize: bool = False` 파라미터 추가
  - Deepgram REST API 호출 시 `diarize=true` 쿼리 파라미터 추가
  - `TranscriptionResult`에 `words: list[dict]` 필드 추가 (speaker 정보 포함)
  - 의존성: 없음

- [x] **P5-T1.2**: 화자 그룹핑 유틸리티 추출 `담당: backend-specialist`
  - `backend/app/services/speaker_utils.py` 신규 생성
  - `channel_stt.py:150`의 `_group_words_by_speaker()` 로직을 공통 유틸로 추출
  - `channel_stt.py`에서 공통 유틸 import로 교체
  - 의존성: 없음

- [x] **P5-T1.3**: VodSttService에서 화자 정보 저장 `담당: backend-specialist`
  - `backend/app/services/vod_stt_service.py` 수정
  - `stt_service.transcribe(diarize=True)` 호출
  - speaker별 그룹핑 → `"화자 1"`, `"화자 2"` 형태로 자막 저장
  - 의존성: T1.1, T1.2

- [x] **P5-T1.4**: 프론트엔드 화자 표시 개선 `담당: frontend-specialist`
  - `frontend/src/components/SubtitleItem.tsx` 수정
  - `frontend/src/components/SubtitlePanel.tsx` 수정
  - 화자별 색상 구분 (화자 1 = 파랑, 화자 2 = 초록, ...)
  - 화자 라벨 뱃지 스타일링
  - 의존성: 없음 (백엔드 독립)

### Feature 2: 자막 수동 교정 (Subtitle Editor)

- [x] **P5-T2.1**: 자막 수정 API (단건 + 배치) `담당: backend-specialist`
  - `backend/app/api/subtitles.py` 수정
  - `PATCH /api/meetings/{meeting_id}/subtitles/{subtitle_id}` 추가
  - `PATCH /api/meetings/{meeting_id}/subtitles` 배치 수정 추가
  - body: `{ text?, speaker? }` 또는 `{ items: [{ id, text?, speaker? }] }`
  - 의존성: 없음

- [x] **P5-T2.2**: 자막 수정 API 클라이언트 함수 `담당: frontend-specialist`
  - `frontend/src/lib/api.ts` 수정
  - `updateSubtitle(meetingId, subtitleId, data)` 추가
  - `updateSubtitlesBatch(meetingId, items)` 추가
  - 의존성: T2.1

- [x] **P5-T2.3**: 자막 편집 페이지 `담당: frontend-specialist`
  - `frontend/src/app/vod/[id]/edit/page.tsx` 신규 생성
  - 좌: Mp4Player 재사용, 우: 편집 가능한 자막 목록
  - 각 행: 시간 | 화자(드롭다운) | 텍스트(textarea)
  - 현재 재생 위치 → 해당 자막 하이라이트
  - "저장" 버튼 (변경된 항목만 PATCH)
  - 의존성: T2.2

- [x] **P5-T2.4**: VOD 뷰어에서 편집 페이지 링크 `담당: frontend-specialist`
  - `frontend/src/app/vod/[id]/page.tsx` 수정
  - 자막 있을 때 "자막 편집" 버튼 → `/vod/{id}/edit`
  - 의존성: T2.3

---

## Phase 5-B: 통합검색 + 공식 회의록

### Feature 3: 통합검색 강화

- [x] **P5-T3.1**: 통합 검색 API `담당: backend-specialist`
  - `backend/app/api/search.py` 신규 생성
  - `GET /api/search` (q, date_from, date_to, speaker, limit, offset)
  - subtitles + meetings 조인 검색 (Supabase REST)
  - 의존성: 없음

- [x] **P5-T3.2**: 검색 라우터 등록 (T3.1에서 함께 완료) `담당: backend-specialist`
  - `backend/app/main.py` 수정
  - search_router import 및 include_router 추가
  - 의존성: T3.1

- [x] **P5-T3.3**: 통합 검색 페이지 `담당: frontend-specialist`
  - `frontend/src/app/search/page.tsx` 신규 생성
  - 검색 입력 + 필터 (날짜 범위, 화자)
  - 결과: 회의명 + 자막 하이라이트 + 시간
  - 결과 클릭 → `/vod/{id}?t={start_time}`
  - 의존성: T3.2

- [x] **P5-T3.4**: Header에 검색 버튼 추가 `담당: frontend-specialist`
  - `frontend/src/components/Header.tsx` 수정
  - 검색 아이콘 → `/search` 이동
  - 의존성: T3.3

- [x] **P5-T3.5**: 검색 API 클라이언트 `담당: frontend-specialist`
  - `frontend/src/lib/api.ts` 수정
  - `globalSearch(params)` 함수 추가
  - 의존성: T3.2

### Feature 5: 공식 회의록 형식

- [x] **P5-T5.1**: 공식 회의록 포맷 생성 `담당: backend-specialist`
  - `backend/app/services/transcript_export.py` 수정
  - `export_official_format()` 함수 추가
  - 의존성: Feature 1 완료 (T1.3)

- [x] **P5-T5.2**: 내보내기 API 확장 `담당: backend-specialist`
  - `backend/app/api/exports.py` 수정
  - `GET /api/meetings/{id}/export?format=official` 추가
  - 의존성: T5.1

- [x] **P5-T5.3**: 프론트엔드 내보내기 버튼 확장 `담당: frontend-specialist`
  - `frontend/src/components/TranscriptExportButton.tsx` 수정
  - "공식 회의록 형식" 옵션 추가
  - 의존성: T5.2

---

## Phase 5-C: 의안 연결 (향후)

### Feature 4: 의안-회의록 연결

- [x] **P5-T4.1**: DB 스키마 - bills 테이블 `담당: database-specialist`
  - `backend/migrations/003_bills.sql` 신규
  - bills + bill_mentions 테이블
  - 의존성: 없음

- [x] **P5-T4.2**: 의안 CRUD API `담당: backend-specialist`
  - `backend/app/api/bills.py` 신규
  - GET/POST /api/bills, POST /api/bills/{id}/mentions
  - 의존성: T4.1

- [x] **P5-T4.3**: 의안 관리 페이지 `담당: frontend-specialist`
  - `frontend/src/app/bills/page.tsx` 신규
  - 의안 목록 + 검색/필터 + 관련 회의록 연결
  - 의존성: T4.2

---

## Phase 7: 대조관리 + AI 요약

### Feature 6: 대조관리 (Verification)

- [x] **P7-T1.1**: DB 마이그레이션 - 검증 상태 필드 `담당: backend-specialist`
  - `backend/migrations/005_phase7.sql` 신규
  - subtitles 테이블에 `verification_status VARCHAR(20) DEFAULT 'unverified'` 추가
  - CHECK (verification_status IN ('unverified', 'verified', 'flagged'))
  - meeting_summaries 테이블 신규 생성
  - 의존성: 없음

- [x] **P7-T1.2**: 대조관리 서비스 `담당: backend-specialist`
  - `backend/app/services/verification_service.py` 신규
  - `get_verification_stats(meeting_id)` → 검증 통계 (verified/unverified/flagged 건수)
  - `update_verification_status(subtitle_id, status)` → 개별 자막 검증 상태 변경
  - `batch_verify(meeting_id, subtitle_ids)` → 일괄 검증 처리
  - `get_low_confidence_subtitles(meeting_id, threshold=0.7)` → 낮은 신뢰도 자막 우선 표시
  - 의존성: T1.1

- [x] **P7-T1.3**: 대조관리 API 엔드포인트 `담당: backend-specialist`
  - `backend/app/api/subtitles.py` 수정
  - `GET /api/meetings/{id}/subtitles/verification-stats` → 검증 통계
  - `PATCH /api/meetings/{id}/subtitles/{sid}/verify` → 개별 검증
  - `POST /api/meetings/{id}/subtitles/batch-verify` → 일괄 검증
  - `GET /api/meetings/{id}/subtitles/review-queue` → 미검증/저신뢰 자막 큐
  - 의존성: T1.2

- [x] **P7-T1.4**: Frontend API 클라이언트 (대조관리) `담당: frontend-specialist`
  - `frontend/src/lib/api.ts` 수정
  - `getVerificationStats()`, `verifySubtitle()`, `batchVerify()`, `getReviewQueue()` 추가
  - `frontend/src/types/index.ts` 수정 - VerificationStats, ReviewQueueItem 타입
  - 의존성: T1.3

- [x] **P7-T1.5**: 대조 검증 UI `담당: frontend-specialist`
  - `frontend/src/app/vod/[id]/verify/page.tsx` 신규
  - 좌: Mp4Player (구간 반복 재생 기능)
  - 우: 검증 대기 자막 큐 (낮은 신뢰도 우선 정렬)
  - 각 자막: 재생 버튼 + 텍스트 + 검증(✓)/수정/플래그(⚑) 버튼
  - 상단: 검증 진행률 바 (verified/total %)
  - 의존성: T1.4

- [x] **P7-T1.6**: VOD 뷰어에 대조 검증 링크 `담당: frontend-specialist`
  - `frontend/src/app/vod/[id]/page.tsx` 수정
  - "자막 검증" 버튼 → `/vod/{id}/verify`
  - 검증 진행률 배지 표시
  - 의존성: T1.5

### Feature 7: AI 요약 (Meeting Summary)

- [x] **P7-T2.1**: AI 요약 서비스 `담당: backend-specialist`
  - `backend/app/services/summary_service.py` 신규
  - `generate_meeting_summary(meeting_id, supabase)` → GPT 기반 회의 요약 생성
  - 자막을 화자별로 그룹핑 → GPT에 전달 → 구조화된 요약 반환
  - 요약 구조: 전체 요약(2-3문장), 안건별 요약, 핵심 결정사항, 후속 조치
  - grammar_checker.py와 동일한 httpx + OpenAI 패턴 사용
  - 의존성: T1.1 (meeting_summaries 테이블)

- [x] **P7-T2.2**: AI 요약 API `담당: backend-specialist`
  - `backend/app/api/meetings.py` 수정
  - `POST /api/meetings/{id}/summary` → 요약 생성 (비동기)
  - `GET /api/meetings/{id}/summary` → 요약 조회
  - `DELETE /api/meetings/{id}/summary` → 요약 삭제 (재생성용)
  - 의존성: T2.1

- [x] **P7-T2.3**: Frontend API 클라이언트 (요약) `담당: frontend-specialist`
  - `frontend/src/lib/api.ts` 수정
  - `generateSummary(meetingId)`, `getSummary(meetingId)`, `deleteSummary(meetingId)` 추가
  - `frontend/src/types/index.ts` 수정 - MeetingSummaryType 타입
  - 의존성: T2.2

- [x] **P7-T2.4**: 요약 패널 컴포넌트 `담당: frontend-specialist`
  - `frontend/src/components/MeetingSummaryPanel.tsx` 신규
  - 요약 표시: 전체 요약 → 안건별 → 핵심 결정 → 후속 조치
  - "AI 요약 생성" 버튼 (요약 미존재 시)
  - 생성 중 로딩 상태 + 재생성 버튼
  - 의존성: T2.3

- [x] **P7-T2.5**: VOD 뷰어에 요약 패널 통합 `담당: frontend-specialist`
  - `frontend/src/app/vod/[id]/page.tsx` 수정
  - MeetingSummaryPanel을 사이드바에 탭으로 추가 (자막 | 요약 | 정보)
  - 의존성: T2.4

- [x] **P7-T2.6**: 내보내기에 요약 포함 `담당: backend-specialist`
  - `backend/app/services/transcript_export.py` 수정
  - 공식 회의록 + 마크다운 내보내기에 요약 섹션 추가
  - 의존성: T2.1
