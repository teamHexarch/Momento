import type { Metadata, Viewport } from 'next';

const OG_IMAGE = 'https://momento.hexarch.org/assets/og-momento.jpg';

/** The favicon set and the link-preview image every page uses (the 404 page builds its own head from these) */
export const siteIcons: Metadata['icons'] = {
  icon: [
    { url: '/favicon.ico', sizes: '48x48' },
    { url: '/assets/favicon-96.png', type: 'image/png', sizes: '96x96' },
    { url: '/assets/favicon-192.png', type: 'image/png', sizes: '192x192' },
  ],
  apple: '/assets/apple-touch-icon.png',
};
export const shareImages = [
  {
    url: OG_IMAGE,
    type: 'image/jpeg',
    width: 1200,
    height: 630,
    alt: 'Momento: three photo prints from one shared event album',
  },
];
export const shareImageUrl = OG_IMAGE;

/** What every page puts in <head> besides its title, description and address (same values the original pages had). */
export function pageMetadata({
  title,
  description,
  url,
  shareTitle = title,
  shareDescription = description,
}: {
  title: string;
  description: string;
  /** the page's public address, used for the canonical link and the link preview */
  url: string;
  /** the title link previews use, when it differs from the tab title (the home page) */
  shareTitle?: string;
  /** the description link previews use, when it differs from the page description (the Social page) */
  shareDescription?: string;
}): Metadata {
  return {
    metadataBase: new URL('https://momento.hexarch.org'),
    title,
    description,
    referrer: 'strict-origin-when-cross-origin',
    // written as a plain tag: Next's own formatDetection option lists the three values in a different order
    other: { 'format-detection': 'telephone=no, email=no, address=no' },
    alternates: { canonical: url },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/assets/favicon-96.png', type: 'image/png', sizes: '96x96' },
        { url: '/assets/favicon-192.png', type: 'image/png', sizes: '192x192' },
      ],
      apple: '/assets/apple-touch-icon.png',
    },
    openGraph: {
      siteName: 'Momento',
      type: 'website',
      title: shareTitle,
      description: shareDescription,
      url,
      images: [
        {
          url: OG_IMAGE,
          type: 'image/jpeg',
          width: 1200,
          height: 630,
          alt: 'Momento: three photo prints from one shared event album',
        },
      ],
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description: shareDescription, images: [OG_IMAGE] },
  };
}

export const pageViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // theme-color is written by hand in SharedHead: the page keeps these tags in step with the chosen theme, and
  // Next would otherwise put a second, English-light copy back after the page loads
};
