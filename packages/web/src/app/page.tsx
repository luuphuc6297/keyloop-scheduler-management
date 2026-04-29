'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loadTokens } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const tokens = loadTokens();
    router.replace(tokens?.accessToken ? '/dashboard' : '/login');
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </main>
  );
}
