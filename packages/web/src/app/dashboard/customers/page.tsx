'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, UserX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomers } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const customers = useCustomers(q, { allowEmpty: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Search by first name, last name, or email. Anonymized customers are hidden."
      />

      <div className="space-y-1.5">
        <Label htmlFor="cust-search">Search</Label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="cust-search"
            placeholder="Type at least 2 characters…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {customers.isLoading ? (
        <Card className="p-4">
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ) : !customers.data || customers.data.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="No matches"
          description={`No active customers found for "${q}".`}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {customers.data.map((c) => (
                  <motion.tr
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
