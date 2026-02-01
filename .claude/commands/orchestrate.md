# Orchestrate Command

TASKS.md 기반 태스크 오케스트레이션

## 사용법

```
/orchestrate           # 현재 Phase 태스크 실행
/orchestrate T1.4      # 특정 태스크 실행
/orchestrate --phase 2 # 특정 Phase 실행
```

## 워크플로우

1. **TASKS.md 파싱**: `docs/planning/06-tasks.md` 읽기
2. **의존성 분석**: 실행 가능한 태스크 파악
3. **에이전트 호출**: Task 도구로 전문가 에이전트 호출
4. **결과 검증**: 테스트 실행, 린트 확인
5. **체크박스 업데이트**: 완료된 태스크 [x] 표시

## 에이전트 매핑

| 담당 | subagent_type |
|------|---------------|
| backend-specialist | backend-specialist |
| frontend-specialist | frontend-specialist |
| database-specialist | database-specialist |
| test-specialist | test-specialist |
| security-specialist | security-specialist |

## 호출 예시

```
Task({
  subagent_type: "backend-specialist",
  description: "P1-T1.4: 자막 DB 저장 연동",
  prompt: `
## 태스크 정보
- Phase: 1
- 태스크 ID: T1.4
- 담당: backend-specialist

## 작업 내용
자막 생성 시 DB에 저장하는 기능 구현

## 스펙
- 자막 생성 시 자동 DB 저장
- 세션 시작/종료 시 상태 업데이트

## AC (Acceptance Criteria)
- 자막 저장 지연 < 1초
- 세션 상태 정확

## TDD
1. RED: 테스트 먼저 작성
2. GREEN: 최소 구현
3. REFACTOR: 리팩토링
`
})
```

## 오케스트레이터 규칙

1. **직접 코드 작성 금지** - 항상 전문가 에이전트 호출
2. **TASKS.md 업데이트 허용** - 체크박스만 수정
3. **CLAUDE.md 업데이트 허용** - 진행 상황, Lessons Learned
4. **Git 명령어 허용** - 커밋, 브랜치, 병합
