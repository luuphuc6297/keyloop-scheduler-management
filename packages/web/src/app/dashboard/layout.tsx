'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loadTokens } from '@/lib/api';
import { useLogout, useMe } from '@/lib/queries';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  useEffect(() => {
    if (!loadTokens()?.accessToken) router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <h1 className="text-base font-semibold">Keyloop Scheduler</h1>
          <div className="flex items-center gap-3 text-sm">
            {me.data ? (
              <span className="text-muted-foreground">{me.data.email}</span>
            ) : (
              <span className="text-muted-foreground">Loading…</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout.mutateAsync();
                router.replace('/login');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
