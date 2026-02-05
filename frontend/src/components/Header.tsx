import React from 'react';

import Link from 'next/link';

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

export default function Header({
  title,
  showSearch = false,
  showLiveBadge = false,
  showVodBadge = false,
  showRegisterButton = false,
  onRegisterClick,
  children,
}: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
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
    </header>
  );
}
