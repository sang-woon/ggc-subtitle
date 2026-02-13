import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const mockSetMobileOpen = jest.fn();

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({
    collapsed: false,
    mobileOpen: false,
    toggleCollapsed: jest.fn(),
    setMobileOpen: mockSetMobileOpen,
  }),
}));

jest.mock('@/contexts/BreadcrumbContext', () => ({
  useBreadcrumb: () => ({
    dynamicTitle: null,
    setTitle: jest.fn(),
  }),
}));

import TopHeader from '../TopHeader';

describe('TopHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders top header with data-testid', () => {
    render(<TopHeader />);
    expect(screen.getByTestId('top-header')).toBeInTheDocument();
  });

  it('renders search link', () => {
    render(<TopHeader />);
    const searchLink = screen.getByTitle('통합 검색');
    expect(searchLink).toBeInTheDocument();
    expect(searchLink.closest('a')).toHaveAttribute('href', '/search');
  });

  it('renders mobile menu button', () => {
    render(<TopHeader />);
    const menuButton = screen.getByLabelText('메뉴 열기');
    expect(menuButton).toBeInTheDocument();
  });

  it('calls setMobileOpen on menu button click', () => {
    render(<TopHeader />);
    const menuButton = screen.getByLabelText('메뉴 열기');
    fireEvent.click(menuButton);
    expect(mockSetMobileOpen).toHaveBeenCalledWith(true);
  });

  it('renders breadcrumbs showing 대시보드', () => {
    render(<TopHeader />);
    expect(screen.getByText('대시보드')).toBeInTheDocument();
  });
});
