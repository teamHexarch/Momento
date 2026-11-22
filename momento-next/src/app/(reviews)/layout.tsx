import type { Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageViewport } from '@/lib/metadata';

// The Support page's styles (this page is built from its parts), then the shared glass + touch sheets
import '@/styles/support.css';
import '@/styles/glass.css';
import '@/styles/touch.css';
import '@/styles/nav-extra.css';   // the header menu's Reviews link
// The Reviews page's own parts (after the shared sheets)
import '@/styles/reviews.css';

export const viewport: Viewport = pageViewport;

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-theme-pref are set by the boot script before React hydrates
    <html lang="en" data-page="reviews" suppressHydrationWarning>
      <head>
        <SharedHead
          variant="inner"
          momentoStore
          fontsHref="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}