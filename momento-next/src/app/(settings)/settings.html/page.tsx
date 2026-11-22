import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SiteHeader from '@/components/shared/SiteHeader';
import SettingsPage from '@/components/settings/SettingsPage';
import { pageMetadata } from '@/lib/metadata';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';
import Shell from '@/components/shell/Shell';
import SettingsScripts from '@/page-scripts/SettingsScripts';

// Served at /settings.html on purpose: the page scripts recognise pages by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Settings | Momento',
  description: 'Upload rules, cloud destination, privacy and appearance for your Momento account.',
  url: 'https://hexarch.org/settings.html',
});

// Page behaviour is the original code, run in the original order: the language menu script that sat inside the markup,
// the two inline blocks of settings.html, then the scripts that were `defer`red in <head>.
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

export default function SettingsRoute() {
  return (
    <ThemeProvider>
    <AccountProvider activity>
      <Backdrop />
      <SvgSprite />
      <SiteHeader current="settings" />
      <SettingsPage />
      <Shell />
      <Toaster />
      <SettingsScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}