import React from 'react';

export type BadgeVariant = 'live' | 'success' | 'warning' | 'secondary';

export interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  live: 'bg-red-100 text-red-600',
  success: 'bg-green-100 text-green-600',
  warning: 'bg-yellow-100 text-yellow-600',
  secondary: 'bg-gray-100 text-gray-700',
};

export default function Badge({ variant, children, className = '' }: BadgeProps) {
  const baseStyles = 'inline-flex items-center px-2 py-1 rounded text-xs font-semibold';
  const variantStyle = variantStyles[variant];

  return (
    <span className={`${baseStyles} ${variantStyle} ${className}`.trim()}>
      {variant === 'live' && (
        <span className="w-2 h-2 bg-red-600 rounded-full mr-1.5 animate-pulse" />
      )}
      {children}
    </span>
  );
}
