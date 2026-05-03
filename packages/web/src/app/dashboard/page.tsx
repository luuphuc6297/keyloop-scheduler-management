'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/appointments');
  }, [router]);
  return null;
}
