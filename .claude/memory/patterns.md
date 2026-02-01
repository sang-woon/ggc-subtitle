# Code Patterns

> 프로젝트에서 사용하는 코드 패턴

## API 라우트 패턴

```typescript
// src/app/api/[resource]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // ... 로직
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## React 컴포넌트 패턴

```typescript
// src/components/[domain]/[Component].tsx
'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ComponentProps {
  className?: string;
}

export function Component({ className }: ComponentProps) {
  const [state, setState] = useState();

  return (
    <div className={cn('base-styles', className)}>
      {/* content */}
    </div>
  );
}
```

## Custom Hook 패턴

```typescript
// src/hooks/use[Name].ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseHookOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useHook(options: UseHookOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ... 로직

  return {
    isLoading,
    error,
    // ... 반환값
  };
}
```

## Drizzle 쿼리 패턴

```typescript
// 조회
const items = await db.select().from(table).where(eq(table.id, id));

// 삽입
const [newItem] = await db.insert(table).values({ ... }).returning();

// 업데이트
await db.update(table).set({ ... }).where(eq(table.id, id));

// 삭제
await db.delete(table).where(eq(table.id, id));
```
