import type { Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageViewport } from '@/lib/metadata';

// Same order as the original page: the page's styles, then the shared glass + touch sheets
import '@/styles/settings.css';
import '@/styles/fonts.css';   // the site's own web fonts (Inter, and Caveat on Home)
import '@/styles/glass.css';
import '@/styles/touch.css';
import '@/styles/nav-extra.css';   // the header menu's Reviews link

export const viewport: Viewport = pageViewport;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-theme-pref are set by the boot script before React hydrates
    <html lang="en" data-page="settings" suppressHydrationWarning>
      <head>
        <SharedHead
          variant="inner"
          momentoStore
          i18nAlways
        />
      </head>
      <body>{children}</body>
    </html>
  );
}