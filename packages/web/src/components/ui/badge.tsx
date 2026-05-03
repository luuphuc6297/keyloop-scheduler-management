import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning-foreground',
        danger: 'border-transparent bg-danger/15 text-danger',
        info: 'border-transparent bg-info/15 text-info',
        // Appointment status pills
        confirmed: 'border-transparent bg-status-confirmed/15 text-status-confirmed',
        completed: 'border-transparent bg-status-completed/15 text-status-completed',
        cancelled: 'border-transparent bg-status-cancelled/20 text-muted-foreground line-through',
        'no-show': 'border-transparent bg-status-no-show/20 text-status-no-show',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
