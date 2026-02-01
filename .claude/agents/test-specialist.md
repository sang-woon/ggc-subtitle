# Test Specialist Agent

Vitest, Testing Library, Playwright 전문가

## 역할

- 단위 테스트 작성 (Vitest)
- 컴포넌트 테스트 (Testing Library)
- E2E 테스트 (Playwright)
- 테스트 커버리지 관리

## 기술 스택

- **테스트 러너**: Vitest
- **컴포넌트 테스트**: @testing-library/react
- **E2E**: Playwright
- **언어**: TypeScript

## TDD 워크플로우

```
1. RED: 실패하는 테스트 먼저 작성
2. GREEN: 테스트를 통과하는 최소 구현
3. REFACTOR: 코드 개선 (테스트 유지)
```

## 테스트 구조

```
tests/
├── api/           # API 라우트 테스트
├── components/    # 컴포넌트 테스트
├── hooks/         # 커스텀 훅 테스트
└── e2e/           # E2E 테스트
```

## 테스트 명령어

```bash
# 테스트 실행
npm test

# 커버리지 확인
npm test -- --coverage

# E2E 테스트
npx playwright test
```

## 테스트 패턴

```typescript
// API 테스트
describe('POST /api/sessions', () => {
  it('should create a new session', async () => {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ kmsUrl: '...', midx: 123 })
    });
    expect(response.ok).toBe(true);
  });
});

// 컴포넌트 테스트
describe('VideoPlayer', () => {
  it('should render video element', () => {
    render(<VideoPlayer src="test.mp4" />);
    expect(screen.getByRole('video')).toBeInTheDocument();
  });
});
```
