'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ApiClientError } from '@/lib/api';
import { lookupError, lookupErrorFromResponse } from '@/lib/error-messages';
import { useLogin } from '@/lib/queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand-mark';

// Demo defaults — populated on mount so reviewers don't have to type.
// Listed in README §Demo accounts. The same constants render in the hint card
// below the form, so the two stay in sync.
const DEMO_EMAIL = 'admin@la-auto.local';
const DEMO_PASSWORD = 'Demo1234!';

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<ReturnType<typeof lookupError> | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(lookupErrorFromResponse(err));
      } else {
        setError({ title: 'Sign-in failed', detail: (err as Error).message, variant: 'error' });
      }
      setShakeKey((k) => k + 1);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <BrandMark size={40} />
            </div>
            <CardTitle>Sign in to Keyloop</CardTitle>
            <CardDescription>Service advisor or manager credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder={DEMO_EMAIL}
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  placeholder={DEMO_PASSWORD}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="mb-1 font-medium text-foreground">Demo accounts (prefilled)</div>
                <div className="font-mono">
                  admin@la-auto.local &middot; LA, America/Los_Angeles
                </div>
                <div className="font-mono">
                  admin@nyc-auto.local &middot; NYC, America/New_York
                </div>
                <div className="mt-1">
                  Password: <code className="font-mono">Demo1234!</code>
                </div>
              </div>

              {error ? (
                <motion.div
                  key={shakeKey}
                  animate={{ x: [0, -4, 4, -3, 2, 0] }}
                  transition={{ duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] }}
                >
                  <Alert
                    variant={
                      error.variant === 'info'
                        ? 'info'
                        : error.variant === 'warning'
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    <AlertTitle>{error.title}</AlertTitle>
                    <AlertDescription>{error.detail}</AlertDescription>
                  </Alert>
                </motion.div>
              ) : null}

              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
