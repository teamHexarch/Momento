import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SiteHeader from '@/components/shared/SiteHeader';
import SupportPage from '@/components/support/SupportPage';
import LegacyScripts from '@/legacy/LegacyScripts';
import { pageMetadata } from '@/lib/metadata';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';

// Served at /support.html on purpose: the page scripts recognise pages by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Support | Momento',
  description: 'Quick answers, and a way to contact the Momento team.',
  url: 'https://hexarch.org/support.html',
});

// Page behaviour is the original code, run in the original order: the two inline blocks of support.html, then the scripts
// that were `defer`red in <head>.
const SCRIPTS = [
  '/legacy/support-1.js',
  '/legacy/support-2.js',
  '/assets/extras.js',
  '/assets/crop.js',
  '/assets/inbox.js',
  '/assets/pickers.js',
  '/assets/nearby.js',
  '/assets/qr.js',
  '/assets/album-settings.js',
  '/assets/event.js',
];

export default function SupportRoute() {
  return (
    <ThemeProvider>
    <AccountProvider>
      <Backdrop />
      <SvgSprite />
      <SiteHeader current={null} />
      <SupportPage />
      <Toaster />
      <LegacyScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}