import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'content' | 'feature-cream' | 'feature-dark' | 'outline';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'content',
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded-md p-xl';

  const variantStyles = {
    content: 'bg-canvas-soft text-ink',
    'feature-cream': 'bg-canvas-soft text-ink',
    'feature-dark': 'bg-ink text-on-primary',
    outline: 'bg-canvas text-ink border border-ink',
  }[variant];

  return (
    <div className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
      {children}
    </div>
  );
};
