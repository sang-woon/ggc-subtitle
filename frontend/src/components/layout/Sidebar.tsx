'use client';

import React from 'react';

import { NAV_MODULES, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from '@/config/navigation';
import { useSidebar } from '@/contexts/SidebarContext';

import MeetingWorkflowNav from './MeetingWorkflowNav';
import SidebarNavItem from './SidebarNavItem';

export default function Sidebar() {
  const { collapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useSidebar();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* 로고 + 시스템 제목 */}
      <div className={`flex items-center border-b border-gray-200 ${collapsed ? 'justify-center px-2 py-4' : 'px-4 py-4'}`}>
        {collapsed ? (
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
            G
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              G
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">경기도의회</div>
              <div className="text-xs text-gray-500 truncate">영상회의록 통합플랫폼</div>
            </div>
          </div>
        )}
      </div>

      {/* 네비게이션 모듈 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_MODULES.map((module) => (
          <SidebarNavItem key={module.id} module={module} collapsed={collapsed} />
        ))}
      </nav>

      {/* 회의 워크플로우 서브내비 */}
      <MeetingWorkflowNav collapsed={collapsed} />

      {/* 사이드바 접기/펼치기 버튼 */}
      <div className="border-t border-gray-200 p-2">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span>사이드바 접기</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 모바일 사이드바 (슬라이드) */}
      <aside
        data-testid="sidebar-mobile"
        className={`fixed top-0 left-0 z-50 h-full bg-white border-r border-gray-200 transition-transform duration-300 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: SIDEBAR_WIDTH }}
      >
        {sidebarContent}
      </aside>

      {/* 데스크톱 사이드바 */}
      <aside
        data-testid="sidebar-desktop"
        className="hidden lg:flex flex-col bg-white border-r border-gray-200 transition-all duration-300 flex-shrink-0"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
