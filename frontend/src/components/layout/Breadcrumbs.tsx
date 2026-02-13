'use client';

import React from 'react';

import { usePathname } from 'next/navigation';

import { BREADCRUMB_MAP } from '@/config/navigation';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';

export default function Breadcrumbs() {
  const pathname = usePathname();
  const { dynamicTitle } = useBreadcrumb();

  // 정적 매핑에서 브레드크럼 가져오기
  let crumbs = BREADCRUMB_MAP[pathname];

  // 동적 경로 처리: /vod/[id], /vod/[id]/edit, /vod/[id]/verify
  if (!crumbs && pathname.startsWith('/vod/')) {
    const segments = pathname.split('/').filter(Boolean);
    // /vod/[id]
    if (segments.length === 2) {
      crumbs = ['회의관리', dynamicTitle || 'VOD 상세'];
    }
    // /vod/[id]/speaker
    else if (segments.length === 3 && segments[2] === 'speaker') {
      crumbs = ['화자관리', dynamicTitle || 'VOD 상세', '화자 식별'];
    }
    // /vod/[id]/edit
    else if (segments.length === 3 && segments[2] === 'edit') {
      crumbs = ['교정/편집관리', dynamicTitle || 'VOD 상세', '자막 편집'];
    }
    // /vod/[id]/verify
    else if (segments.length === 3 && segments[2] === 'verify') {
      crumbs = ['대조관리', dynamicTitle || 'VOD 상세', '자막 검증'];
    }
  }

  if (!crumbs || crumbs.length === 0) {
    crumbs = ['대시보드'];
  }

  return (
    <nav aria-label="breadcrumb" className="flex items-center text-sm min-w-0">
      {crumbs.map((crumb, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="mx-1.5 text-gray-300">/</span>
          )}
          {index === crumbs!.length - 1 ? (
            <span className="text-gray-900 font-medium truncate">{crumb}</span>
          ) : (
            <span className="text-gray-500 truncate">{crumb}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
