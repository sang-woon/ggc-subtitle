# Design System (디자인 시스템)

> 경기도의회 실시간 자막 서비스

---

## 1. 디자인 원칙

### 1.1 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **기능 중심** | 화려함보다 실용성, 업무 효율 우선 |
| **가독성** | 자막 텍스트가 명확하게 보여야 함 |
| **심플** | 불필요한 장식 배제, 깔끔한 인터페이스 |
| **반응형** | 데스크톱 우선, 모바일 대응 |

### 1.2 타겟 분위기

- **전문적**: 공공기관 내부 도구
- **신뢰감**: 안정적이고 정돈된 느낌
- **효율적**: 정보 밀도 높음, 한눈에 파악

---

## 2. 컬러 팔레트

### 2.1 Primary Colors

| 이름 | HEX | 용도 |
|------|-----|------|
| Primary | `#2563EB` | 주요 버튼, 링크, 강조 |
| Primary Light | `#3B82F6` | Hover 상태 |
| Primary Dark | `#1D4ED8` | Active 상태 |

### 2.2 Neutral Colors

| 이름 | HEX | 용도 |
|------|-----|------|
| Gray 900 | `#111827` | 본문 텍스트 |
| Gray 700 | `#374151` | 부제목, 레이블 |
| Gray 500 | `#6B7280` | 비활성 텍스트, 플레이스홀더 |
| Gray 300 | `#D1D5DB` | 테두리, 구분선 |
| Gray 100 | `#F3F4F6` | 배경 (섹션) |
| White | `#FFFFFF` | 기본 배경 |

### 2.3 Semantic Colors

| 이름 | HEX | 용도 |
|------|-----|------|
| Live Red | `#DC2626` | 실시간 방송 표시 |
| Success Green | `#16A34A` | 성공, 완료 상태 |
| Warning Yellow | `#CA8A04` | 경고, 진행중 |
| Error Red | `#DC2626` | 에러 메시지 |
| Highlight Yellow | `#FEF08A` | 검색 키워드 하이라이트 |

### 2.4 TailwindCSS 설정

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          dark: '#1D4ED8',
        },
        live: '#DC2626',
        highlight: '#FEF08A',
      },
    },
  },
};
```

---

## 3. 타이포그래피

### 3.1 폰트 패밀리

| 용도 | 폰트 |
|------|------|
| 기본 | Pretendard, -apple-system, sans-serif |
| 코드/자막 시간 | JetBrains Mono, monospace |

### 3.2 폰트 사이즈

| 레벨 | 크기 | 용도 |
|------|------|------|
| H1 | 24px (1.5rem) | 페이지 제목 |
| H2 | 20px (1.25rem) | 섹션 제목 |
| H3 | 18px (1.125rem) | 카드 제목 |
| Body | 16px (1rem) | 본문, 자막 텍스트 |
| Small | 14px (0.875rem) | 보조 텍스트, 시간 |
| XS | 12px (0.75rem) | 레이블, 뱃지 |

### 3.3 자막 텍스트 스타일

```css
/* 자막 기본 스타일 */
.subtitle-text {
  font-size: 16px;
  line-height: 1.6;
  color: #111827;
}

/* 현재 재생 중인 자막 */
.subtitle-current {
  background-color: #EFF6FF;
  border-left: 3px solid #2563EB;
}

/* 검색 하이라이트 */
.subtitle-highlight {
  background-color: #FEF08A;
  padding: 0 2px;
  border-radius: 2px;
}
```

---

## 4. 레이아웃

### 4.1 기본 그리드

```
Desktop (> 1024px)
┌─────────────────────────────────────────────────────────────────┐
│  Header (64px)                                                   │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │                      │
│         Main Content (70%)                │   Sidebar (30%)      │
│                                           │                      │
│                                           │                      │
│                                           │                      │
└───────────────────────────────────────────┴─────────────────────┘
```

### 4.2 뷰어 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: 로고 | 회의 제목 | 상태 배지              | 검색창     │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │  자막 히스토리       │
│                                           │  ─────────────────  │
│         영상 플레이어                     │  [시간] 텍스트...    │
│                                           │  [시간] 텍스트...    │
│         70% 너비                          │  [시간] 텍스트...    │
│                                           │       30% 너비       │
│                                           │                      │
├───────────────────────────────────────────┴─────────────────────┤
│  컨트롤바: 재생 | 볼륨 | 배속 | 시간                             │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 반응형 브레이크포인트

| 브레이크포인트 | 너비 | 레이아웃 변화 |
|---------------|------|--------------|
| Mobile | < 768px | 영상 100% → 자막 아래 |
| Tablet | 768px ~ 1024px | 60%/40% 분할 |
| Desktop | > 1024px | 70%/30% 분할 |

---

## 5. 컴포넌트

### 5.1 버튼

```css
/* Primary Button */
.btn-primary {
  background-color: #2563EB;
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
  transition: background-color 0.2s;
}
.btn-primary:hover {
  background-color: #3B82F6;
}
.btn-primary:active {
  background-color: #1D4ED8;
}

/* Secondary Button */
.btn-secondary {
  background-color: white;
  color: #374151;
  border: 1px solid #D1D5DB;
  padding: 10px 20px;
  border-radius: 6px;
}
.btn-secondary:hover {
  background-color: #F3F4F6;
}
```

### 5.2 상태 배지

```css
/* Live 배지 */
.badge-live {
  display: inline-flex;
  align-items: center;
  background-color: #FEE2E2;
  color: #DC2626;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.badge-live::before {
  content: '';
  width: 8px;
  height: 8px;
  background-color: #DC2626;
  border-radius: 50%;
  margin-right: 6px;
  animation: pulse 1.5s infinite;
}

/* 완료 배지 */
.badge-completed {
  background-color: #DCFCE7;
  color: #16A34A;
}

/* 진행중 배지 */
.badge-processing {
  background-color: #FEF9C3;
  color: #CA8A04;
}
```

### 5.3 자막 아이템

```html
<div class="subtitle-item">
  <span class="subtitle-time">10:15:30</span>
  <p class="subtitle-text">의장님, 제가 발언하겠습니다.</p>
</div>
```

```css
.subtitle-item {
  padding: 12px 16px;
  border-bottom: 1px solid #F3F4F6;
  cursor: pointer;
  transition: background-color 0.15s;
}
.subtitle-item:hover {
  background-color: #F9FAFB;
}
.subtitle-item.current {
  background-color: #EFF6FF;
  border-left: 3px solid #2563EB;
}
.subtitle-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #6B7280;
  display: block;
  margin-bottom: 4px;
}
.subtitle-text {
  font-size: 15px;
  line-height: 1.5;
  color: #111827;
}
```

### 5.4 검색창

```html
<div class="search-container">
  <svg class="search-icon">...</svg>
  <input type="text" placeholder="키워드 검색..." class="search-input" />
</div>
```

```css
.search-container {
  position: relative;
  max-width: 300px;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9CA3AF;
}
.search-input {
  width: 100%;
  padding: 10px 16px 10px 40px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
}
.search-input:focus {
  outline: none;
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
```

### 5.5 영상 플레이어 컨테이너

```css
.video-container {
  position: relative;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
}
.video-controls {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 16px;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}
```

---

## 6. 아이콘

### 6.1 아이콘 라이브러리

- **Heroicons** (https://heroicons.com/)
- Outline 스타일 기본 사용

### 6.2 주요 아이콘

| 아이콘 | 용도 |
|--------|------|
| `play` | 재생 |
| `pause` | 일시정지 |
| `magnifying-glass` | 검색 |
| `video-camera` | 실시간 방송 |
| `document-text` | VOD/자막 |
| `clock` | 시간 |
| `arrow-left` | 뒤로가기 |
| `plus` | 추가 |

---

## 7. 애니메이션

### 7.1 트랜지션

```css
/* 기본 트랜지션 */
.transition-default {
  transition: all 0.2s ease-in-out;
}

/* 호버 효과 */
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
```

### 7.2 실시간 표시 애니메이션

```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.live-indicator {
  animation: pulse 1.5s ease-in-out infinite;
}
```

### 7.3 자막 스크롤 애니메이션

```css
.subtitle-list {
  scroll-behavior: smooth;
}

/* 새 자막 추가 시 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.subtitle-item.new {
  animation: slideIn 0.3s ease-out;
}
```

---

## 8. 반응형 디자인

### 8.1 모바일 레이아웃

```css
@media (max-width: 767px) {
  .viewer-layout {
    flex-direction: column;
  }

  .video-container {
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .subtitle-panel {
    width: 100%;
    height: 40vh;
    max-height: 300px;
  }

  .search-container {
    width: 100%;
  }
}
```

### 8.2 태블릿 레이아웃

```css
@media (min-width: 768px) and (max-width: 1023px) {
  .viewer-layout {
    flex-direction: row;
  }

  .video-container {
    width: 60%;
  }

  .subtitle-panel {
    width: 40%;
  }
}
```

---

## 9. 접근성

### 9.1 색상 대비

- 본문 텍스트: 최소 4.5:1 대비 (WCAG AA)
- 대형 텍스트: 최소 3:1 대비

### 9.2 키보드 네비게이션

```css
/* 포커스 표시 */
:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}

/* 스킵 링크 */
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
}
.skip-link:focus {
  top: 0;
}
```

### 9.3 ARIA 레이블

```html
<button aria-label="재생">
  <svg>...</svg>
</button>

<div role="log" aria-live="polite" aria-label="자막 히스토리">
  <!-- 자막 아이템들 -->
</div>
```

---

## 10. 다크 모드 (v2)

```css
/* v2에서 구현 예정 */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #111827;
    --bg-secondary: #1F2937;
    --text-primary: #F9FAFB;
    --text-secondary: #9CA3AF;
  }
}
```
