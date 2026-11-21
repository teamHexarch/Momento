import type { Metadata } from 'next';
import PrivacyBody from '@/components/privacy/PrivacyBody';
import LegacyScripts from '@/legacy/LegacyScripts';
import { pageMetadata } from '@/lib/metadata';

// Served at /privacy.html on purpose: the rest of the site links to it by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy | Momento',
  description: "What Momento collects, why, where it's kept and how to have it deleted.",
  url: 'https://hexarch.org/privacy.html',
});

// No page scripts. LegacyScripts only lets the language file (assets/i18n.js) start once the page is ready.
export default function PrivacyRoute() {
  return (
    <>
      <PrivacyBody />
      <LegacyScripts scripts={[]} />
    </>
  );
}