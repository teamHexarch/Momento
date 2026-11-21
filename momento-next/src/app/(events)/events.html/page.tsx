import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SiteHeader from '@/components/shared/SiteHeader';
import EventsPage from '@/components/events/EventsPage';
import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import { pageMetadata } from '@/lib/metadata';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';

// Served at /events.html on purpose: the page scripts recognise pages by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Social | Momento',
  description:
    'Your friend groups and event albums in one place: share albums with the people you see most, join events with an invitation and discover events nearby.',
  url: 'https://hexarch.org/events.html',
  shareTitle: 'Join the album on Momento',
  shareDescription: 'You’re invited to share photos. Open the link to see the album and add yours. No sign-up needed.',
});

// Page behaviour is the original code, run in the original order: the two inline blocks of events.html, then the scripts that
// were `defer`red in <head>, in the order <head> listed them (the map library sits between event.js and event-albums.js).
const SCRIPTS: LegacyScript[] = [
  '/legacy/events-1.js',
  '/legacy/events-2.js',
  '/assets/extras.js',
  '/assets/crop.js',
  '/assets/inbox.js',
  '/assets/pickers.js',
  '/assets/nearby.js',
  '/assets/qr.js',
  '/assets/album-settings.js',
  '/assets/event.js',
  // The globe: MapLibre GL, pinned and checked against its published hash (its stylesheet is bundled in the layout)
  {
    src: 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
    integrity: 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp',
    crossOrigin: 'anonymous',
  },
  '/assets/event-albums.js',
];

export default function EventsRoute() {
  return (
    <ThemeProvider>
    <AccountProvider activity>
      <Backdrop />
      <SvgSprite />
      <SiteHeader current="social" />
      <EventsPage />
      <Toaster />
      <LegacyScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}