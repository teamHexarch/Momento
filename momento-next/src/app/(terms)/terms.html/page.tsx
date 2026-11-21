import type { Metadata } from 'next';
import TermsBody from '@/components/terms/TermsBody';
import LegacyScripts from '@/legacy/LegacyScripts';
import { pageMetadata } from '@/lib/metadata';

// Served at /terms.html on purpose: the rest of the site links to it by that address.
export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service | Momento',
  description: "The rules for using Momento: your account, your photos, what isn't allowed, copyright complaints and accessibility.",
  url: 'https://hexarch.org/terms.html',
});

// No page scripts. LegacyScripts only lets the language file (assets/i18n.js) start once the page is ready.
export default function TermsRoute() {
  return (
    <>
      <TermsBody />
      <LegacyScripts scripts={[]} />
    </>
  );
}