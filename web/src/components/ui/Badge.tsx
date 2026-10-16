import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'simulated' | 'active' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-sans font-medium text-caption px-md py-xxs rounded-pill';

  const variantStyles = {
    default: 'bg-canvas-soft text-ink border border-mute/50',
    simulated: 'bg-ink text-on-primary font-semibold',
    active: 'bg-primary text-on-primary font-semibold',
    outline: 'bg-transparent text-body border border-mute',
  }[variant];

  return (
    <span className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
      {children}
    </span>
  );
};
