import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  id,
  className = '',
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-xs">
      {label && (
        <label htmlFor={selectId} className="text-body-sm font-semibold text-ink">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`bg-canvas text-ink border border-ink px-lg py-md rounded-sm text-body-md focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-b-2 border-b-primary' : ''
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
