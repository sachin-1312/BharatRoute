import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'text';
  size?: 'md' | 'sm';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-sans transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';

  const sizeStyles =
    size === 'md'
      ? 'px-xl py-md rounded-md text-button-md min-h-[48px]'
      : 'px-lg py-sm rounded-md text-button-sm min-h-[36px]';

  const variantStyles = {
    primary:
      'bg-primary text-on-primary hover:bg-primary-hover active:bg-[#cc3f00]',
    secondary:
      'bg-ink text-on-primary hover:bg-ink-soft active:bg-ink-mid',
    tertiary:
      'bg-canvas text-ink border border-ink hover:bg-canvas-soft active:bg-[#f0ebe3]',
    text:
      'bg-transparent text-ink hover:bg-canvas-soft active:bg-[#f0ebe3]',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
