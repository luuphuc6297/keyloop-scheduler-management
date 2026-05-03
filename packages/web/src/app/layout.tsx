import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: 'Keyloop Scheduler',
  description: 'Service appointment scheduler — demo client',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `suppressHydrationWarning` on <html> + <body>: browser extensions (Material
  // Design Lite, Grammarly, dark-mode helpers, etc.) inject classes/attributes
  // onto the document before React hydrates. Without this flag every reviewer
  // running such an extension sees a hydration error in DevTools even though
  // the SSR/client trees are otherwise identical. This is the officially
  // recommended workaround:
  //   https://nextjs.org/docs/messages/react-hydration-error
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
