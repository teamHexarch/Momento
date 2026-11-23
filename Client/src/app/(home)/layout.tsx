import type { Metadata, Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageMetadata, pageViewport } from '@/lib/metadata';

// Same order as the original page: the page's own styles first, then the shared glass + touch sheets
import '@/styles/home.css';
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
          fontsHref="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
