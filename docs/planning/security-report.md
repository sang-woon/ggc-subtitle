# Security Report - ggc-subtitle

**검사 일시**: 2026-02-01
**검사 대상**: ggc-subtitle (경기도의회 실시간 자막 시스템)
**검사 버전**: 0.1.0

---

## 요약

| 구분 | CRITICAL | HIGH | MEDIUM | LOW | 합계 | 조치 상태 |
|------|----------|------|--------|-----|------|----------|
| API 키 노출 | 1 | 0 | 0 | 0 | 1 | 확인 필요 |
| SQL 인젝션 | 0 | 0 | 0 | 0 | 0 | PASS |
| CORS 설정 | 0 | 1 | 0 | 0 | 1 | **FIXED** |
| XSS 취약점 | 0 | 0 | 0 | 0 | 0 | PASS |
| 환경변수 검증 | 0 | 0 | 1 | 0 | 1 | **FIXED** |
| 의존성 취약점 | 0 | 0 | 4 | 0 | 4 | 모니터링 |
| **합계** | **1** | **0** | **4** | **0** | **5** |  |

**전체 보안 등급**: IMPROVED (HIGH 이슈 해결됨, CRITICAL은 확인 필요)

---

## 1. API 키 노출 검사

### 1.1 CRITICAL - .env.local 파일에 실제 API 키 포함

**파일**: `.env.local`

**발견 내용**:
```
RTZR_CLIENT_ID=82p39rt9L_ayL-QRqEmh
RTZR_CLIENT_SECRET=8-erG7aMXXCdwOsShp9bwGN7eb0KBjagVd_vEVRb
NEXT_PUBLIC_SUPABASE_URL=https://buffokcknbnzrodniekb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_M_sl5HF2JjRyPdCl6HJTwg_6Mc7SvBZ
DATABASE_URL=postgresql://postgres.buffokcknbnzrodniekb:rudrleh1002%40@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
```

**위험성**:
- .env.local 파일이 Git에 커밋되면 API 키가 유출됨
- RTZR API 키가 유출되면 무단 사용으로 인한 비용 발생 가능
- DATABASE_URL에 비밀번호가 포함되어 있어 DB 접근 권한 탈취 가능

**확인 사항**:
- .gitignore에 `.env*` 패턴이 포함되어 있음 (PASS)
- Git에 커밋되지 않음 (PASS)

**권장 조치**:
1. API 키를 즉시 재발급 (이미 노출되었을 수 있음)
2. Vercel 등 배포 플랫폼의 환경변수 기능 사용
3. 민감정보는 절대 로컬 파일에 평문 저장하지 않기

### 1.2 PASS - 클라이언트 코드에 API 키 노출 없음

**검사 결과**:
- RTZR API 키: 서버 사이드 (`/api/auth/rtzr/route.ts`)에서만 사용 (PASS)
- Supabase ANON Key: `NEXT_PUBLIC_` 접두사 사용 (의도된 공개 키)
- DATABASE_URL: 서버 사이드 (`/db/client.ts`)에서만 사용 (PASS)

**코드 확인**:
```typescript
// src/app/api/auth/rtzr/route.ts (서버 사이드)
const clientId = process.env.RTZR_CLIENT_ID;
const clientSecret = process.env.RTZR_CLIENT_SECRET;
```

---

## 2. SQL 인젝션 방지 확인

### 2.1 PASS - Drizzle ORM 사용으로 안전

**검사 결과**: 모든 DB 쿼리가 Drizzle ORM을 통해 파라미터 바인딩 방식으로 처리됨

**검사 파일**:
- `src/app/api/subtitles/route.ts`
- `src/app/api/subtitles/[id]/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/subtitles/batch/route.ts`
- `src/app/api/subtitles/export/route.ts`

**안전한 코드 예시**:
```typescript
// src/app/api/subtitles/route.ts:81
// Drizzle ORM의 like() 함수는 파라미터 바인딩 사용
.where(like(subtitles.text, `%${query}%`))

// src/app/api/subtitles/[id]/route.ts:30
// eq() 함수도 파라미터 바인딩 사용
.where(eq(subtitles.id, id))
```

**참고**:
- Drizzle ORM은 내부적으로 모든 쿼리를 prepared statement로 처리
- 사용자 입력이 직접 SQL 문자열에 삽입되지 않음

---

## 3. CORS 설정 검토

### 3.1 HIGH - 과도하게 허용된 CORS 설정

**파일**: `src/app/api/kms/proxy/route.ts`

**발견 코드**:
```typescript
// Line 61-63
responseHeaders.set('Access-Control-Allow-Origin', '*');
responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
responseHeaders.set('Access-Control-Allow-Headers', 'Range');
```

**위험성**:
- `Access-Control-Allow-Origin: *`는 모든 도메인에서 접근 허용
- 악의적인 사이트에서 API를 호출하여 KMS 비디오 프록시 악용 가능
- SSRF (Server-Side Request Forgery) 공격 벡터가 될 수 있음

**완화 요소**:
- KMS URL 검증 로직 존재 (`kms.ggc.go.kr` 도메인만 허용)
```typescript
// Line 17
if (!videoUrl.includes('kms.ggc.go.kr')) {
  return NextResponse.json({ error: 'Invalid KMS URL' }, { status: 400 });
}
```

**권장 조치**:
1. 프로덕션 환경에서는 특정 도메인만 허용
```typescript
const ALLOWED_ORIGINS = [
  'https://your-production-domain.com',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
].filter(Boolean);

const origin = request.headers.get('origin');
if (origin && ALLOWED_ORIGINS.includes(origin)) {
  responseHeaders.set('Access-Control-Allow-Origin', origin);
}
```

### 3.2 INFO - Next.js 기본 CORS 설정

**파일**: `next.config.ts`

**현재 상태**:
```typescript
const nextConfig: NextConfig = {
  /* config options here */
};
```

**권장 조치**:
프로덕션 배포 시 명시적 CORS 헤더 설정 권장

---

## 4. XSS 취약점 검사

### 4.1 PASS - React의 자동 이스케이프 사용

**검사 결과**: XSS 취약점 없음

**검사 항목**:
1. `dangerouslySetInnerHTML` 사용 없음
2. 사용자 입력이 직접 DOM에 삽입되지 않음
3. React의 자동 HTML 이스케이프 활용

**안전한 코드 예시**:
```typescript
// src/app/search/page.tsx - highlightText 함수
// 검색어 하이라이팅 시 안전하게 처리
function highlightText(text: string, query: string): React.ReactNode {
  // 정규식 특수문자 이스케이프
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  // React 컴포넌트로 반환 (자동 이스케이프)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
```

**추가 확인**:
- 자막 텍스트 표시: React 컴포넌트에서 `{text}` 형태로 렌더링 (자동 이스케이프)
- URL 파라미터: `encodeURIComponent()` 사용

---

## 5. 환경변수 검증

### 5.1 MEDIUM - 환경변수 누락 시 런타임 에러 가능

**발견 내용**:

1. **`src/db/client.ts`**:
```typescript
const connectionString = process.env.DATABASE_URL!;
// Non-null assertion (!) 사용 - 환경변수 누락 시 런타임 에러
```

2. **`src/lib/supabase.ts`**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// 동일한 문제
```

**위험성**:
- 환경변수가 설정되지 않으면 애플리케이션 시작 시 크래시
- 에러 메시지가 불명확하여 디버깅 어려움

**권장 조치**:

1. Zod를 사용한 환경변수 검증 추가:
```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  RTZR_CLIENT_ID: z.string().min(1),
  RTZR_CLIENT_SECRET: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  RTZR_CLIENT_ID: process.env.RTZR_CLIENT_ID,
  RTZR_CLIENT_SECRET: process.env.RTZR_CLIENT_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
```

### 5.2 PASS - RTZR 인증 API에서 환경변수 체크 존재

**파일**: `src/app/api/auth/rtzr/route.ts`

```typescript
if (!clientId || !clientSecret) {
  return NextResponse.json(
    { error: 'RTZR credentials not configured' },
    { status: 500 }
  );
}
```

---

## 6. 의존성 보안 검사 (npm audit)

### 6.1 MODERATE - esbuild 취약점 (4건)

**취약점 정보**:
- **CVE**: GHSA-67mh-4wv8-2f99
- **심각도**: MODERATE (CVSS 5.3)
- **영향 패키지**: `esbuild` <= 0.24.2
- **설명**: esbuild 개발 서버가 모든 웹사이트의 요청을 허용하여 응답 읽기 가능

**영향 범위**:
```
esbuild <= 0.24.2
  -> @esbuild-kit/core-utils
    -> @esbuild-kit/esm-loader
      -> drizzle-kit (0.31.8)
```

**위험성 분석**:
- 개발 환경에서만 영향 (drizzle-kit은 devDependency)
- 프로덕션 빌드에는 포함되지 않음
- 로컬 개발 시 악의적 웹사이트 방문 시 위험 존재

**권장 조치**:
1. drizzle-kit 업데이트 대기 (현재 fix 버전 없음)
2. 개발 환경에서 신뢰할 수 없는 웹사이트 방문 자제
3. 정기적으로 `npm audit` 실행하여 취약점 모니터링

---

## 7. 추가 보안 권장사항

### 7.1 인증/인가 미구현

**현재 상태**:
- 모든 API 엔드포인트가 인증 없이 접근 가능
- 자막 수정/삭제 API에 권한 검사 없음

**코드 확인**:
```typescript
// src/app/api/subtitles/[id]/route.ts:47
editedBy: 'user', // TODO: 인증 시스템 추가 시 실제 사용자 ID
```

**권장 조치**:
1. 프로덕션 배포 전 인증 시스템 구현
2. Next.js Auth.js 또는 Supabase Auth 활용 권장
3. API Rate Limiting 추가

### 7.2 입력 검증 강화

**권장 조치**:
1. API 요청 본문에 Zod 스키마 검증 추가
2. URL 파라미터 검증 강화

```typescript
// 예시: src/app/api/subtitles/route.ts
import { z } from 'zod';

const subtitleSchema = z.object({
  sessionId: z.string().uuid(),
  startTimeMs: z.number().int().min(0),
  endTimeMs: z.number().int().min(0),
  text: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1).optional(),
  seq: z.number().int().optional(),
});
```

### 7.3 에러 메시지 정보 누출

**현재 상태**:
일부 API에서 상세 에러 정보가 클라이언트에 노출됨

```typescript
// src/app/api/auth/rtzr/route.ts:34
{ error: 'Failed to authenticate with RTZR', details: errorText }
```

**권장 조치**:
- 프로덕션에서는 상세 에러를 서버 로그에만 기록
- 클라이언트에는 일반적인 에러 메시지만 반환

---

## 8. 체크리스트 요약

| 검사 항목 | 결과 | 비고 |
|----------|------|------|
| .env 파일 Git 제외 | PASS | .gitignore에 포함됨 |
| RTZR 키 서버 사이드 사용 | PASS | 클라이언트 노출 없음 |
| Supabase ANON 키 | PASS | 공개용 키로 설계됨 |
| DATABASE_URL 보호 | PASS | 서버 사이드에서만 사용 |
| SQL 인젝션 방지 | PASS | Drizzle ORM 파라미터 바인딩 |
| XSS 방지 | PASS | React 자동 이스케이프 |
| CORS 설정 | WARNING | 프로덕션 전 수정 필요 |
| 환경변수 검증 | WARNING | Zod 스키마 추가 권장 |
| 의존성 취약점 | WARNING | 4건 MODERATE (개발용) |
| 인증/인가 | NOT IMPL | 프로덕션 전 구현 필요 |

---

## 9. 즉시 조치 필요 사항

### CRITICAL
1. **API 키 재발급** - .env.local의 실제 키가 외부에 노출되었을 가능성 대비

### HIGH
1. **CORS 설정 수정** - 프로덕션 배포 전 `Access-Control-Allow-Origin: *` 제거

### MEDIUM
1. **환경변수 검증 추가** - Zod 스키마로 시작 시 검증
2. **npm audit 정기 실행** - CI/CD 파이프라인에 추가

---

---

## 10. 수정 완료 사항

### 10.1 CORS 설정 강화 (HIGH -> FIXED)

**수정 파일**: `src/app/api/kms/proxy/route.ts`

**수정 내용**:
1. Origin 기반 CORS 검증 추가
2. 개발 환경에서만 localhost 허용
3. 프로덕션 환경에서는 `NEXT_PUBLIC_APP_URL`에 설정된 도메인만 허용

```typescript
// 허용된 Origin 목록
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

// Origin 검증 함수 추가
function getAllowedOrigin(request: NextRequest): string | null {
  // ...
}
```

### 10.2 SSRF 방지 강화 (MEDIUM -> FIXED)

**수정 파일**:
- `src/app/api/kms/proxy/route.ts`
- `src/app/api/kms/video-url/route.ts`

**수정 내용**:
1. `includes()` 대신 URL 파싱을 통한 정확한 호스트 검증
2. 허용된 호스트 목록 기반 검증

```typescript
// URL 검증 헬퍼 함수 (SSRF 방지)
function isValidKmsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_KMS_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
```

### 10.3 환경변수 검증 추가 (MEDIUM -> FIXED)

**추가 파일**: `src/lib/env.ts`

**수정 파일**:
- `src/db/client.ts`
- `src/lib/supabase.ts`
- `src/app/api/auth/rtzr/route.ts`

**수정 내용**:
1. Zod 스키마 기반 환경변수 검증 추가
2. 서버/클라이언트 환경변수 분리
3. 누락 시 명확한 에러 메시지 제공

```typescript
// src/lib/env.ts
export function getServerEnv() {
  const result = serverEnvSchema.safeParse({...});
  if (!result.success) {
    throw new Error(`Server environment validation failed:\n${errors}`);
  }
  return result.data;
}
```

### 10.4 API 입력 검증 스키마 추가 (NEW)

**추가 파일**: `src/lib/validations/api.ts`

**내용**:
- 자막 생성/수정 스키마
- 세션 생성 스키마
- 배치 저장 스키마
- 검색 쿼리 스키마
- 페이지네이션 스키마

---

## 변경 이력

| 날짜 | 작성자 | 내용 |
|------|--------|------|
| 2026-02-01 | Security Specialist | 초기 보안 검사 및 보고서 작성 |
| 2026-02-01 | Security Specialist | CORS, SSRF, 환경변수 검증 수정 완료 |
