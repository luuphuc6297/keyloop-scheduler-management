'use client';

import { Plus, Calendar as CalIcon, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const SLATE_RAMP = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
const BRAND_RAMP = SLATE_RAMP;

export default function DesignSystemPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Design system"
        description="Reference page — every primitive in every state. Hidden from production navigation."
      />

      <Section title="Color tokens" description="Two-tier system: reference scale + semantic mapping.">
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">Slate (neutral)</h4>
        <Ramp colors={SLATE_RAMP.map((s) => ({ name: s, className: `bg-[hsl(var(--slate-${s}))]` }))} />
        <h4 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">Brand (indigo)</h4>
        <Ramp colors={BRAND_RAMP.map((s) => ({ name: s, className: `bg-brand-${s}` }))} />
        <h4 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">Semantic</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch label="primary" className="bg-primary text-primary-foreground" />
          <Swatch label="success" className="bg-success text-success-foreground" />
          <Swatch label="warning" className="bg-warning text-warning-foreground" />
          <Swatch label="danger" className="bg-danger text-danger-foreground" />
          <Swatch label="info" className="bg-info text-info-foreground" />
          <Swatch label="muted" className="bg-muted text-foreground" />
          <Swatch label="surface" className="bg-surface text-foreground border" />
          <Swatch label="background" className="bg-background text-foreground border" />
        </div>
        <h4 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">Status</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch label="confirmed" className="bg-status-confirmed text-white" />
          <Swatch label="completed" className="bg-status-completed text-white" />
          <Swatch label="cancelled" className="bg-status-cancelled text-white" />
          <Swatch label="no-show" className="bg-status-no-show text-white" />
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-3">
          <p className="text-3xl font-bold">text-3xl / Page hero</p>
          <p className="text-2xl font-semibold">text-2xl / Page heading</p>
          <p className="text-xl font-semibold">text-xl / Section heading</p>
          <p className="text-lg font-medium">text-lg / Subheading</p>
          <p className="text-base">text-base / Body default</p>
          <p className="text-sm">text-sm / Body small</p>
          <p className="text-xs text-muted-foreground">text-xs / Meta</p>
          <p className="font-mono text-sm">font-mono / API codes &amp; IDs</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon">
            <Plus className="h-4 w-4" />
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Separator orientation="vertical" className="h-6" />
          <Badge variant="confirmed">confirmed</Badge>
          <Badge variant="completed">completed</Badge>
          <Badge variant="cancelled">cancelled</Badge>
          <Badge variant="no-show">no_show</Badge>
        </div>
      </Section>

      <Section title="Form inputs">
        <div className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="ds-email">Email</Label>
            <Input id="ds-email" type="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-select">Service</Label>
            <Select>
              <SelectTrigger id="ds-select">
                <SelectValue placeholder="Pick one…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oil">Oil change</SelectItem>
                <SelectItem value="brakes">Brake replacement</SelectItem>
                <SelectItem value="tire">Tire rotation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3">
          <Alert variant="info">
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Informational message goes here.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Booked</AlertTitle>
            <AlertDescription>The appointment was created successfully.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Outside business hours</AlertTitle>
            <AlertDescription>The dealership is closed at the requested time.</AlertDescription>
          </Alert>
          <Alert variant="danger">
            <AlertTitle>Bay unavailable</AlertTitle>
            <AlertDescription>The requested bay is already booked.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Short supporting text.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Main card body content.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <CardDescription>5 confirmed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">12</div>
              <p className="text-xs text-muted-foreground">appointments</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="techs">Technicians</TabsTrigger>
            <TabsTrigger value="bays">Bays</TabsTrigger>
          </TabsList>
          <TabsContent value="services">Services tab content.</TabsContent>
          <TabsContent value="techs">Technicians tab content.</TabsContent>
          <TabsContent value="bays">Bays tab content.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Tooltip + Popover">
        <div className="flex gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalIcon className="h-4 w-4" />
                Click me
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="space-y-2">
                <p className="text-sm font-medium">Popover content</p>
                <p className="text-xs text-muted-foreground">
                  Use for contextual UI like filters or date pickers.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </Section>

      <Section title="Avatar">
        <div className="flex gap-3">
          <Avatar>
            <AvatarImage src="" alt="" />
            <AvatarFallback>LP</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">AB</AvatarFallback>
          </Avatar>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={CalIcon}
          title="No appointments yet"
          description="Click 'Book appointment' to create your first one."
          action={
            <Button>
              <Plus className="h-4 w-4" />
              Book appointment
            </Button>
          }
        />
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success('Appointment booked')}>Success</Button>
          <Button variant="outline" onClick={() => toast.warning('Outside business hours')}>
            Warning
          </Button>
          <Button variant="destructive" onClick={() => toast.error('Bay unavailable')}>
            Error
          </Button>
          <Button variant="ghost" onClick={() => toast('Saved')}>
            Default
          </Button>
        </div>
      </Section>

      <Section title="Animation utilities">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border bg-surface px-3 py-2 text-sm animate-fade-in">
            animate-fade-in
          </div>
          <div className="rounded-md border bg-surface px-3 py-2 text-sm animate-slide-in-up">
            animate-slide-in-up
          </div>
          <div className="rounded-md border bg-surface px-3 py-2 text-sm animate-scale-in">
            animate-scale-in
          </div>
          <Alert variant="danger" className="animate-shake-x">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>animate-shake-x</AlertTitle>
            <AlertDescription>Triggered on PRECONDITION_FAILED in production.</AlertDescription>
          </Alert>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">{children}</div>
    </section>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className={`flex h-12 items-center justify-center rounded-md text-xs font-medium ${className}`}>
      {label}
    </div>
  );
}

function Ramp({ colors }: { colors: Array<{ name: string; className: string }> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c) => (
        <div key={c.name} className={`h-10 w-10 rounded-md border border-border ${c.className}`} title={c.name} />
      ))}
    </div>
  );
}
