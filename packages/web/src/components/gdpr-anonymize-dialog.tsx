'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ApiClientError } from '@/lib/api';
import { errorToToast } from '@/lib/error-messages';
import { useAnonymizeCustomer } from '@/lib/queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  customerId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
}

export function GdprAnonymizeDialog({ customerId, customerName, open, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const anonymize = useAnonymizeCustomer();

  const canSubmit = reason.trim().length >= 5 && confirmation === 'DELETE';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await anonymize.mutateAsync({ id: customerId, reason });
      toast.success('Customer anonymized', {
        description: 'PII redacted; appointments and audit history retained.',
      });
      reset();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const t = errorToToast(err);
        toast[t.variant](t.title, { description: t.detail });
      } else {
        toast.error('Anonymize failed', { description: (err as Error).message });
      }
    }
  }

  function reset() {
    setReason('');
    setConfirmation('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonymize customer (GDPR)</DialogTitle>
          <DialogDescription>
            This action redacts <strong>{customerName}</strong>&apos;s PII (name, email, phone) and
            cannot be undone. Appointment records and audit history are retained for legal
            compliance.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>This is irreversible</AlertTitle>
          <AlertDescription>
            The customer record stays in the database with first_name = last_name = &quot;REDACTED&quot;
            and email/phone NULL.
          </AlertDescription>
        </Alert>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anon-reason">Reason (audit trail)</Label>
            <Input
              id="anon-reason"
              placeholder="e.g. GDPR Article 17 request received 2026-04-29"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="anon-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="anon-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit || anonymize.isPending}>
              {anonymize.isPending ? 'Anonymizing…' : 'Anonymize permanently'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
