import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock contexts
const mockToggleCollapsed = jest.fn();
const mockSetMobileOpen = jest.fn();

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({
    collapsed: false,
    mobileOpen: false,
    toggleCollapsed: mockToggleCollapsed,
    setMobileOpen: mockSetMobileOpen,
  }),
}));

jest.mock('@/contexts/BreadcrumbContext', () => ({
  useBreadcrumb: () => ({
    dynamicTitle: null,
    setTitle: jest.fn(),
  }),
}));

import Sidebar from '../Sidebar';

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders logo and system title', () => {
    render(<Sidebar />);
    expect(screen.getAllByText('경기도의회').length).toBeGreaterThan(0);
    expect(screen.getAllByText('영상회의록 통합플랫폼').length).toBeGreaterThan(0);
  });

  it('renders navigation modules', () => {
    render(<Sidebar />);
    expect(screen.getAllByText('회의관리').length).toBeGreaterThan(0);
    expect(screen.getAllByText('의안관리').length).toBeGreaterThan(0);
    expect(screen.getAllByText('통합검색').length).toBeGreaterThan(0);
    expect(screen.getAllByText('시스템관리').length).toBeGreaterThan(0);
  });

  it('renders collapse button', () => {
    render(<Sidebar />);
    expect(screen.getAllByText('사이드바 접기').length).toBeGreaterThan(0);
  });

  it('calls toggleCollapsed on collapse button click', () => {
    render(<Sidebar />);
    const collapseButtons = screen.getAllByText('사이드바 접기');
    const collapseButton = collapseButtons[0];
    if (!collapseButton) {
      throw new Error('Expected collapse button to exist.');
    }
    fireEvent.click(collapseButton);
    expect(mockToggleCollapsed).toHaveBeenCalled();
  });

  it('renders desktop sidebar with data-testid', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-desktop')).toBeInTheDocument();
  });
});
