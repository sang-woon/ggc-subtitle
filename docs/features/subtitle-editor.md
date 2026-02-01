# 자막 인라인 편집 기능 (T1.5)

> 자막 타임라인에서 직접 자막 텍스트를 편집하고 저장할 수 있는 기능입니다.

## 기능 개요

- **편집 모드**: 자막 클릭 시 인라인 편집 UI로 전환
- **키보드 단축키**:
  - `Enter`: 저장 (Shift+Enter는 줄바꿈)
  - `Escape`: 편집 취소
- **수정 이력 보존**: `subtitle_edits` 테이블에 원본/수정 텍스트 저장
- **시각적 표시**: 수정된 자막은 노란색 배경 + "수정됨" 배지

---

## 사용 방법

### 1. SubtitleTimeline 컴포넌트

```tsx
import { SubtitleTimeline } from '@/components/subtitle/SubtitleTimeline';
import { updateSubtitle } from '@/lib/api/subtitles';
import { useState } from 'react';

function MyPage() {
  const [subtitles, setSubtitles] = useState<TimelineSubtitle[]>([...]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const handleSubtitleUpdate = async (id: string, newText: string) => {
    // API 호출
    const updatedSubtitle = await updateSubtitle(id, { text: newText });

    // 로컬 상태 업데이트
    setSubtitles((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text: newText, isEdited: true } : s))
    );
  };

  return (
    <SubtitleTimeline
      subtitles={subtitles}
      currentTimeMs={currentTimeMs}
      onSeek={(timeMs) => videoRef.current?.seek(timeMs)}
      onSubtitleUpdate={handleSubtitleUpdate} // ✅ 편집 기능 활성화
    />
  );
}
```

### 2. 편집 모드 진입

- **방법 1**: 자막 우측의 "편집" 버튼 클릭
- **방법 2**: 자막 텍스트 더블클릭 (onSubtitleUpdate가 있을 때만)

### 3. 저장/취소

- **저장**: "저장" 버튼 또는 `Enter` 키
- **취소**: "취소" 버튼 또는 `Escape` 키

---

## API 엔드포인트

### PUT /api/subtitles/:id

자막 텍스트를 수정합니다.

**Request**

```json
{
  "text": "수정된 자막 텍스트"
}
```

**Response**

```json
{
  "subtitle": {
    "id": "uuid",
    "text": "수정된 자막 텍스트",
    "isEdited": true,
    "originalText": "원본 텍스트",
    "updatedAt": "2026-02-01T12:00:00Z",
    ...
  }
}
```

**Error Codes**

- `400`: text 필드 누락 또는 빈 문자열
- `404`: 존재하지 않는 자막 ID
- `500`: 서버 에러

---

## 데이터베이스 스키마

### subtitles 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `isEdited` | boolean | 수정 여부 (기본: false) |
| `originalText` | text | 원본 텍스트 (수정 시 저장) |
| `updatedAt` | timestamp | 마지막 수정 시각 |

### subtitle_edits 테이블 (이력 관리)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `subtitleId` | uuid | FK → subtitles.id |
| `oldText` | text | 수정 전 텍스트 |
| `newText` | text | 수정 후 텍스트 |
| `editedBy` | text | 수정자 (현재 'user', 추후 인증 시 실제 ID) |
| `createdAt` | timestamp | 수정 시각 |

---

## 컴포넌트 구조

```
SubtitleTimeline.tsx (부모)
├── useState(editingId)              # 편집 중인 자막 ID 관리
├── handleSave()                     # 저장 핸들러 (API 호출 후 상태 업데이트)
├── handleCancelEdit()               # 취소 핸들러
└── SubtitleEditor.tsx (자식)        # 인라인 편집 UI
    ├── textarea (자동 포커스)
    ├── 저장/취소 버튼
    └── 키보드 이벤트 (Enter/Escape)
```

---

## 접근성 (ARIA)

| 요소 | ARIA 속성 | 설명 |
|------|----------|------|
| textarea | `aria-label="자막 편집"` | 스크린 리더 설명 |
| 저장 버튼 | `aria-busy={isSaving}` | 로딩 상태 표시 |
| 편집 버튼 | `aria-label="자막 편집"` | 버튼 목적 명시 |

---

## 제약 사항 및 향후 개선

### 현재 제약 사항

1. **동시 편집 불가**: 한 번에 하나의 자막만 편집 가능
2. **인증 미구현**: `editedBy` 필드에 실제 사용자 ID 대신 'user' 문자열 저장
3. **낙관적 업데이트 없음**: API 응답 후에만 UI 업데이트

### 향후 개선 사항

1. **실시간 동기화**: 여러 사용자가 동시 편집 시 충돌 방지
2. **실행 취소/다시 실행**: `subtitle_edits` 이력을 활용한 Undo/Redo
3. **키워드 하이라이팅**: 검색 결과에서 매칭된 단어 강조
4. **버전 비교 UI**: 원본/수정본 비교 뷰

---

## 테스트 시나리오

### 수동 테스트

1. **편집 모드 진입**
   - [ ] "편집" 버튼 클릭 시 textarea 표시
   - [ ] 더블클릭 시 편집 모드 전환
   - [ ] 자동 포커스 및 텍스트 선택 확인

2. **저장**
   - [ ] Enter 키로 저장 → UI 업데이트
   - [ ] 저장 버튼 클릭 → 로딩 상태 표시
   - [ ] 동일 텍스트 저장 시 편집 모드 종료 (API 호출 없음)

3. **취소**
   - [ ] Escape 키로 취소 → 원본 텍스트 유지
   - [ ] 취소 버튼 클릭 → 편집 모드 종료

4. **에러 핸들링**
   - [ ] 빈 텍스트 저장 시 경고 메시지
   - [ ] 네트워크 에러 시 alert 표시

---

## 파일 목록

| 파일 | 역할 |
|------|------|
| `src/components/subtitle/SubtitleEditor.tsx` | 인라인 편집 UI |
| `src/components/subtitle/SubtitleTimeline.tsx` | 타임라인 + 편집 통합 |
| `src/app/api/subtitles/[id]/route.ts` | PUT/DELETE API |
| `src/lib/api/subtitles.ts` | API 클라이언트 함수 |
| `src/types/subtitle.ts` | UpdateSubtitleRequest 타입 정의 |

---

## 참고 문서

- [06-tasks.md](../planning/06-tasks.md) - T1.5 태스크 정의
- [Schema](../../src/db/schema.ts) - 데이터베이스 스키마
