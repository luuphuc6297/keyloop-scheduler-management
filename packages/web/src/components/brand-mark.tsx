import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  size?: number;
}

/** Inline SVG used in the sidebar header. Same shape as `app/icon.svg`. */
export function BrandMark({ className, size = 32 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 drop-shadow-sm', className)}
    >
      <defs>
        <linearGradient id="brand-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(173 84% 35%)" />
          <stop offset="100%" stopColor="hsl(168 76% 36%)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#brand-gradient)" />
      <path
        d="M9 8h3.5v7.5l5.5-7.5H22l-6 8 6.5 8H18l-5.5-7v7H9z"
        className="fill-white"
      />
    </svg>
  );
}
