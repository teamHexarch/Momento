import type { Metadata, Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageMetadata, pageViewport } from '@/lib/metadata';

// Same order as the original page: the page's own styles first, then the shared glass + touch sheets
import '@/styles/home.css';
import '@/styles/fonts.css';   // the site's own web fonts (Inter, and Caveat on Home)
import '@/styles/glass.css';
import '@/styles/touch.css';
import '@/styles/nav-extra.css';   // the header menu's Reviews link

export const metadata: Metadata = pageMetadata({
  title: 'Momento | Moments, kept.',
  description:
    'One shared album for every event. Guests join with a code or QR code and add their photos, so every picture ends up in one place.',
  url: 'https://hexarch.org/',
  shareTitle: 'Momento: every photo from your event, in one album',
});

export const viewport: Viewport = pageViewport;

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-theme-pref / intro-on are set by the boot script before React hydrates
    <html lang="en" data-page="home" suppressHydrationWarning>
      <head>
        <SharedHead
          variant="home"
          jsonLd
          handwriting
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
