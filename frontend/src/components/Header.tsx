'use client';

import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Badge from './Badge';

export interface HeaderProps {
  title?: string;
  showSearch?: boolean;
  showLiveBadge?: boolean;
  showVodBadge?: boolean;
  showRegisterButton?: boolean;
  onRegisterClick?: () => void;
  children?: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/notes', label: '회의록' },
  { href: '/live', label: '실시간' },
  { href: '/monitor', label: '모니터' },
  { href: '/search', label: '검색' },
];

export default function Header({
  title,
  showSearch = false,
  showLiveBadge = false,
  showVodBadge = false,
  showRegisterButton = false,
  onRegisterClick,
  children,
}: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold text-gray-900 hover:text-primary transition-colors">
            경기도의회 자막
          </Link>

          {title && (
            <span className="text-gray-500">|</span>
          )}

          {title && (
            <span className="text-lg font-medium text-gray-700">{title}</span>
          )}

          {showLiveBadge && (
            <Badge variant="live">Live</Badge>
          )}

          {showVodBadge && (
            <Badge variant="secondary">VOD</Badge>
          )}
        </div>

        <div className="flex items-center gap-4">
          {showSearch && children}

          {showRegisterButton && (
            <button
              onClick={onRegisterClick}
              className="px-4 py-2 bg-primary text-white rounded-md font-medium hover:bg-primary-light active:bg-primary-dark transition-colors"
            >
              VOD 등록
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-4 flex gap-1 -mb-px" data-testid="main-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
