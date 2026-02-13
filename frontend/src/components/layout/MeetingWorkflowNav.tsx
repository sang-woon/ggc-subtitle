'use client';

import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { extractMeetingIdFromPath } from '@/config/navigation';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';

interface MeetingWorkflowNavProps {
  collapsed: boolean;
}

const WORKFLOW_STEPS = [
  { label: '회의 정보', suffix: '' },
  { label: '화자 관리', suffix: '/speaker' },
  { label: '자막 편집', suffix: '/edit' },
  { label: '자막 검증', suffix: '/verify' },
];

export default function MeetingWorkflowNav({ collapsed }: MeetingWorkflowNavProps) {
  const pathname = usePathname();
  const { dynamicTitle } = useBreadcrumb();
  const meetingId = extractMeetingIdFromPath(pathname);

  if (!meetingId || collapsed) return null;

  return (
    <div className="border-t border-gray-200 p-3">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
        현재 회의
      </div>
      {dynamicTitle && (
        <div className="text-sm font-medium text-gray-900 mb-3 px-1 truncate" title={dynamicTitle}>
          {dynamicTitle}
        </div>
      )}
      <div className="space-y-0.5">
        {WORKFLOW_STEPS.map((step, index) => {
          const href = `/vod/${meetingId}${step.suffix}`;
          const isActive = pathname === href;

          return (
            <Link
              key={step.suffix || 'info'}
              href={href}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-primary font-medium border-l-3 border-primary'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                isActive ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {index + 1}
              </span>
              <span>{step.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
