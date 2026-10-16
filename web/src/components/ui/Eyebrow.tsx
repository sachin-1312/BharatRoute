import React from 'react';

export interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export const Eyebrow: React.FC<EyebrowProps> = ({ children, className = '', ...props }) => {
  return (
    <p
      className={`font-display text-eyebrow uppercase text-body-mid tracking-[1px] ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};
