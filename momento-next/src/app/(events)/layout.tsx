import type { Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageViewport } from '@/lib/metadata';

// Same order as the original page: the map library's sheet (pinned, bundled here), the page's styles, the shared glass + touch sheets, then the event-albums sheet
import '@/styles/maplibre-gl.css';
import '@/styles/events.css';
import '@/styles/glass.css';
import '@/styles/touch.css';
import '@/styles/nav-extra.css';   // the header menu's Reviews link
import '@/styles/event-albums.css';

export const viewport: Viewport = pageViewport;

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-theme-pref are set by the boot script before React hydrates
    <html lang="en" data-page="social" suppressHydrationWarning>
      <head>
        <SharedHead
          variant="inner"
          fontsHref="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}