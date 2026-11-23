import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SiteHeader from '@/components/shared/SiteHeader';
import AlbumsPage from '@/components/albums/AlbumsPage';
import AlbumModal from '@/components/albums/AlbumModal';
import ActivityModal from '@/components/albums/ActivityModal';
import BinModal from '@/components/albums/BinModal';
import Viewer from '@/components/albums/Viewer';
import { pageMetadata } from '@/lib/metadata';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';
import Shell from '@/components/shell/Shell';
import AlbumsScripts from '@/page-scripts/AlbumsScripts';

// This page is served at /albums.html on purpose: the page scripts (and the notification links that open
// albums.html#album=...) recognise it by that address.
export const metadata: Metadata = pageMetadata({
  title: 'My albums | Momento',
  description: "Every Momento album you've joined or hosted, in one place.",
  url: 'https://hexarch.org/albums',
});

// Page behaviour is the original code, run in the original order: the emoji list (a plain script in the body),
// the two inline blocks of albums.html, then the shared scripts that were `defer`red in <head>.
const SCRIPTS = [
  '/assets/extras.js',
  '/assets/crop.js',
  '/assets/inbox.js',
  '/assets/pickers.js',
  '/assets/nearby.js',
  '/assets/qr.js',
  '/assets/album-settings.js',
  '/assets/event.js',
  '/assets/join-here.js',
];

export default function AlbumsRoute() {
  return (
    <ThemeProvider>
    <AccountProvider activity>
      <Backdrop />
      <SvgSprite />
      <SiteHeader current="albums" />
      <AlbumsPage />
      <AlbumModal />
      <ActivityModal />
      <BinModal />
      <Viewer />
      <Shell />
      <Toaster />
      <AlbumsScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}
