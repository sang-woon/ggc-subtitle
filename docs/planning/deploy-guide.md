# Vercel 배포 가이드

## 사전 요구사항

- Vercel 계정 (https://vercel.com)
- GitHub 저장소 연동 또는 Vercel CLI

## 환경변수 설정

Vercel 대시보드 또는 CLI에서 다음 환경변수를 설정해야 합니다:

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `RTZR_CLIENT_ID` | RTZR API 클라이언트 ID | `your-client-id` |
| `RTZR_CLIENT_SECRET` | RTZR API 시크릿 | `your-secret` |
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 | `postgresql://...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJhbG...` |
| `NEXT_PUBLIC_APP_URL` | 프로덕션 앱 URL (CORS용) | `https://your-app.vercel.app` |

## 방법 1: Vercel CLI 배포

```bash
# 로그인
npx vercel login

# 프로젝트 연결 (처음 한 번)
cd ggc-subtitle
npx vercel link

# 환경변수 설정
npx vercel env add RTZR_CLIENT_ID
npx vercel env add RTZR_CLIENT_SECRET
npx vercel env add DATABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add NEXT_PUBLIC_APP_URL

# 프리뷰 배포
npx vercel

# 프로덕션 배포
npx vercel --prod
```

## 방법 2: GitHub 연동 배포

1. GitHub에 저장소 푸시
2. Vercel 대시보드에서 "Import Project"
3. GitHub 저장소 선택
4. 환경변수 설정
5. Deploy 클릭

## 배포 후 확인사항

1. **홈페이지**: KMS URL 입력 및 비디오 로드
2. **실시간 자막**: 자막 시작/중지 동작
3. **검색 기능**: `/search` 페이지 검색
4. **히스토리**: `/history` 페이지 세션 목록
5. **내보내기**: SRT/VTT 다운로드

## 문제 해결

### CORS 에러
- `NEXT_PUBLIC_APP_URL` 환경변수가 올바르게 설정되었는지 확인

### 데이터베이스 연결 실패
- `DATABASE_URL` 형식 확인: `postgresql://user:password@host:port/database`
- Supabase에서 "Direct connection" URL 사용

### RTZR API 인증 실패
- `RTZR_CLIENT_ID`, `RTZR_CLIENT_SECRET` 값 확인
- RTZR 콘솔에서 API 키 상태 확인

## 리전 설정

`vercel.json`에서 서울 리전(`icn1`) 사용 설정됨:

```json
{
  "regions": ["icn1"]
}
```

이는 한국 사용자를 위한 최적의 응답 속도를 제공합니다.
