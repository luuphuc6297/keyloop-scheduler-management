'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadTokens } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const ok = Boolean(loadTokens()?.accessToken);
    setAuthed(ok);
    if (!ok) router.replace('/login');
  }, [router]);

  if (authed === null || authed === false) {
    return null;
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
