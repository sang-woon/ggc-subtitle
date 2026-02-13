# VOD 등록 후 피드백 개선

## Context
현재 VOD 등록 성공 시 모달만 닫히고 아무 피드백이 없음. 사용자가 등록 결과를 인지할 수 없고, "최근 VOD" 목록도 갱신되지 않음.

## 변경 사항

**파일**: `frontend/src/app/page.tsx` (1개 파일만 수정)

1. `useToast` 훅 import 추가 (이미 `layout.tsx`에 `ToastProvider` 설정됨)
2. `useRecentVods`에서 `mutate` 함수 추가 destructure
3. 등록 성공 시: `showToast('success', ...)` + `mutate()` 호출
4. 등록 실패 시: `showToast('error', ...)` (현재 모달 내 에러 표시에 추가)

### 기존 인프라 (수정 불필요)
- `Toast.tsx`: `useToast()` → `showToast(variant, message)` - 3초 후 자동 사라짐
- `layout.tsx`: `<ToastProvider>` 이미 래핑됨
- `useRecentVods.ts`: `mutate()` 이미 노출됨
- `RecentVodList.tsx`: `processing` → "자막 생성중" 뱃지, `ended` → "자막 완료" 뱃지

## 검증
- 프론트엔드 빌드 확인
- VOD 등록 성공 → 토스트 + 목록 갱신 확인 (브라우저)
