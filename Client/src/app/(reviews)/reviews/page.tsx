import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SiteHeader from '@/components/shared/SiteHeader';
import ReviewsPage from '@/components/reviews/ReviewsPage';
import { pageMetadata } from '@/lib/metadata';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';
import Shell from '@/components/shell/Shell';
import PageChrome from '@/components/effects/PageChrome';
import LegacyScripts from '@/legacy/LegacyScripts';

export const metadata: Metadata = pageMetadata({
  title: 'Reviews | Momento',
  description: 'Used Momento at an event? Rate it out of 5 stars for the Momento team. Only the overall rating is needed.',
  url: 'https://hexarch.org/reviews',
});

// The shared scripts every app page loads (notifications bell, pickers, the QR code, create album's event fields...)
const SCRIPTS = [
  '/assets/extras.js',
  '/assets/crop.js',
  '/assets/inbox.js',
  '/assets/pickers.js',
  '/assets/nearby.js',
  '/assets/qr.js',
  '/assets/album-settings.js',
  '/assets/event.js',
];

export default function ReviewsRoute() {
  return (
    <ThemeProvider>
    <AccountProvider>
      <Backdrop />
      <SvgSprite />
      <SiteHeader current="reviews" />
      <ReviewsPage />
      <Shell />
      <Toaster />
      <PageChrome hover="a, button, input, textarea, .live-media" />
      <LegacyScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}
