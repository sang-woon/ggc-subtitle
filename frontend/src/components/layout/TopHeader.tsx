'use client';

import React from 'react';

import Link from 'next/link';

import { HEADER_HEIGHT } from '@/config/navigation';
import { useSidebar } from '@/contexts/SidebarContext';

import Breadcrumbs from './Breadcrumbs';

export default function TopHeader() {
  const { setMobileOpen } = useSidebar();

  return (
    <header
      data-testid="top-header"
      className="bg-white border-b border-gray-200 flex items-center px-4 flex-shrink-0"
      style={{ height: HEADER_HEIGHT }}
    >
      {/* 좌측: 모바일 햄버거 + 브레드크럼 */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* 모바일 햄버거 메뉴 */}
        <button
          className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <Breadcrumbs />
      </div>

      {/* 우측: 검색 아이콘 */}
      <div className="flex items-center gap-2">
        <Link
          href="/search"
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          title="통합 검색"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
