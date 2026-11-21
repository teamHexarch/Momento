import type { Viewport } from 'next';
import PlainHead from '@/legacy/PlainHead';
import { pageViewport } from '@/lib/metadata';

import '@/styles/terms.css';

export const viewport: Viewport = pageViewport;

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the theme script before React hydrates
    <html lang="en" suppressHydrationWarning>
      <head>
        <PlainHead translates />
      </head>
      <body>{children}</body>
    </html>
  );
}