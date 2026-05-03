'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Calendar,
  CalendarDays,
  Car,
  LogOut,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDealership, useLogout, useMe } from '@/lib/queries';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BrandMark } from './brand-mark';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { href: '/dashboard/appointments', label: 'Appointments', icon: Calendar },
  { href: '/dashboard/calendar', label: 'Day view', icon: CalendarDays },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/vehicles', label: 'Vehicles', icon: Car },
  { href: '/dashboard/catalog', label: 'Catalog', icon: Wrench },
];

const SECONDARY: NavItem[] = [
  { href: '/dashboard/design-system', label: 'Design system', icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dealership = useDealership();
  const me = useMe();
  const logout = useLogout();

  const isProd = process.env.NODE_ENV === 'production';

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">Keyloop</div>
          <div className="truncate text-xs text-muted-foreground">
            {dealership.data?.name ?? 'Loading…'}
          </div>
        </div>
      </div>
      <Separator />

      {/* Primary nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        {!isProd && SECONDARY.length > 0 ? (
          <>
            <div className="px-2 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dev
            </div>
            {SECONDARY.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </>
        ) : null}
      </nav>

      <Separator />

      {/* User + tz */}
      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {(me.data?.email ?? '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium" title={me.data?.email}>
              {me.data?.email ?? '—'}
            </div>
            {dealership.data?.timezone ? (
              <div className="truncate text-[11px] text-muted-foreground" title={dealership.data.timezone}>
                {dealership.data.timezone}
              </div>
            ) : null}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={async () => {
            await logout.mutateAsync();
            router.replace('/login');
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-xl bg-brand-gradient shadow-teal"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
        />
      ) : null}
      <Icon className={cn('relative z-10 h-4 w-4', active && 'text-white')} />
      <span className={cn('relative z-10', active && 'text-white')}>{item.label}</span>
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  // /dashboard/customers/[id] should highlight Customers
  return pathname.startsWith(href + '/');
}
