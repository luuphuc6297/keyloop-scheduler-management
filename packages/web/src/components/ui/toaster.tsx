'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'group rounded-md border border-border bg-surface-elevated text-surface-foreground shadow-md',
          title: 'text-sm font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton:
            'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover',
          cancelButton: 'rounded-md bg-muted px-2.5 py-1 text-xs',
          error: 'border-danger/30 bg-danger/5',
          success: 'border-success/30 bg-success/5',
          warning: 'border-warning/30 bg-warning/5',
          info: 'border-info/30 bg-info/5',
        },
      }}
    />
  );
}
