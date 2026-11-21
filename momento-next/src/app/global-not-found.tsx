import type { Metadata, Viewport } from 'next';
import NotFoundBody from '@/components/notfound/NotFoundBody';
import PlainHead from '@/legacy/PlainHead';
import { pageViewport, shareImageUrl, shareImages, siteIcons } from '@/lib/metadata';

import '@/styles/notfound.css';

// Shown for any address that doesn't exist (this replaces 404.html, which GitHub Pages served the same way).
// Every link on it starts with "/" because it appears at whatever address was mistyped. Next adds the
// "noindex" robots tag to a 404 by itself, as the original page had.
const TITLE = 'Page not found | Momento';
const DESCRIPTION = "This page doesn't exist on Momento.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  icons: siteIcons,
  manifest: '/manifest.webmanifest',
  openGraph: { siteName: 'Momento', type: 'website', title: TITLE, description: DESCRIPTION, images: shareImages },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [shareImageUrl] },
};

export const viewport: Viewport = pageViewport;

export default function GlobalNotFound() {
  return (
    // data-theme is set by the theme script before React hydrates
    <html lang="en" suppressHydrationWarning>
      <head>
        <PlainHead translates={false} />
      </head>
      <body>
        <NotFoundBody />
      </body>
    </html>
  );
}
