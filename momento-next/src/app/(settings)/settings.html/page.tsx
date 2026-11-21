import type { Metadata } from 'next';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import SettingsHeader from '@/components/settings/SettingsHeader';
import SettingsPage from '@/components/settings/SettingsPage';
import LegacyScripts from '@/legacy/LegacyScripts';
import { pageMetadata } from '@/lib/metadata';

// Served at /settings.html on purpose: the page scripts recognise pages by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Settings | Momento',
  description: 'Upload rules, cloud destination, privacy and appearance for your Momento account.',
  url: 'https://hexarch.org/settings.html',
});

// Page behaviour is the original code, run in the original order: the language menu script that sat inside the markup,
// the two inline blocks of settings.html, then the scripts that were `defer`red in <head>.
const SCRIPTS = [
  '/legacy/settings-1.js',
  '/legacy/settings-2.js',
  '/legacy/settings-3.js',
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
    <>
      <Backdrop />
      <SvgSprite />
      <SettingsHeader />
      <SettingsPage />
      <LegacyScripts scripts={SCRIPTS} />
    </>
  );
}