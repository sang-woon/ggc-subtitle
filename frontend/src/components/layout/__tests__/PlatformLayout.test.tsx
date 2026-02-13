import React from 'react';

import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({
    collapsed: false,
    mobileOpen: false,
    toggleCollapsed: jest.fn(),
    setMobileOpen: jest.fn(),
  }),
}));

jest.mock('@/contexts/BreadcrumbContext', () => ({
  useBreadcrumb: () => ({
    dynamicTitle: null,
    setTitle: jest.fn(),
  }),
}));

import PlatformLayout from '../PlatformLayout';

describe('PlatformLayout', () => {
  it('renders children within the layout', () => {
    render(
      <PlatformLayout>
        <div data-testid="test-content">Hello</div>
      </PlatformLayout>
    );
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders sidebar desktop element', () => {
    render(
      <PlatformLayout>
        <div>Content</div>
      </PlatformLayout>
    );
    expect(screen.getByTestId('sidebar-desktop')).toBeInTheDocument();
  });

  it('renders top header', () => {
    render(
      <PlatformLayout>
        <div>Content</div>
      </PlatformLayout>
    );
    expect(screen.getByTestId('top-header')).toBeInTheDocument();
  });

  it('renders breadcrumbs in header', () => {
    render(
      <PlatformLayout>
        <div>Content</div>
      </PlatformLayout>
    );
    expect(screen.getAllByText('대시보드').length).toBeGreaterThan(0);
  });
});
