import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Keyloop Scheduler',
  description: 'Service appointment scheduler — demo client',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
