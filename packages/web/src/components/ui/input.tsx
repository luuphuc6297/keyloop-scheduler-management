import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // Rolly-style: rounded-xl, soft surface fill, primary-tinted focus ring
        'flex h-10 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-xs transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:font-normal placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-500)/0.12)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';
