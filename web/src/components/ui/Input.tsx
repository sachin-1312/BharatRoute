import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-xs">
      {label && (
        <label htmlFor={inputId} className="text-body-sm font-semibold text-ink">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`bg-canvas text-ink border border-ink px-lg py-md rounded-sm text-body-md focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-b-2 border-b-primary' : ''
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="text-caption text-ink font-medium flex items-center gap-xs">
          <span className="font-bold text-primary">!</span> {error}
        </span>
      )}
      {!error && helperText && (
        <span className="text-caption text-body">{helperText}</span>
      )}
    </div>
  );
};
