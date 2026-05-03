import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Pill-shaped Rolly default. Bolder weight, gentle press scale, soft focus ring.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // Brand gradient + soft teal glow — primary CTA
        default:
          'bg-brand-gradient text-primary-foreground shadow-teal hover:shadow-lg active:shadow-teal-pressed',
        // Tinted teal — secondary CTA on white surface
        secondary:
          'bg-[hsl(var(--brand-500)/0.1)] text-primary border border-[hsl(var(--brand-500)/0.25)] hover:bg-[hsl(var(--brand-500)/0.15)]',
        outline:
          'border border-border-strong bg-surface text-foreground hover:bg-muted',
        ghost:
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90',
        link:
          'text-primary underline-offset-4 hover:underline shadow-none',
        // Filled chip — used for tag-like actions
        chip:
          'bg-muted text-muted-foreground border border-border hover:border-primary hover:text-primary hover:bg-[hsl(var(--brand-500)/0.06)]',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
