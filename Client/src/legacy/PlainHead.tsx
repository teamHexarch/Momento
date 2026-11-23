import { EXTENSION_ATTR_GUARD, THEME_COLOR_SYNC, i18nLoader } from './headScripts';

// "Same theme choice as the rest of the site" (the small script Terms, Privacy and the 404 page carry)
const PLAIN_THEME = `
(() => {
  let pref = 'system';
  try { pref = localStorage.getItem('momento-theme') || 'system'; } catch (e) {}
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
`;

/**
 * The head of the plain pages (Terms, Privacy, 404): a theme script, the browser-bar colour, and, for the pages
 * that translate (Terms, Privacy), the language loader. No shared page scripts. Same notes as SharedHead.
 */
export default function PlainHead({ translates }: { translates: boolean }) {
  return (
    <>
      {process.env.NODE_ENV !== 'production' && (
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_ATTR_GUARD }} suppressHydrationWarning />
      )}
      {translates && <style dangerouslySetInnerHTML={{ __html: 'html.i18n-pending body { visibility: hidden; }' }} />}
      {translates && <script dangerouslySetInnerHTML={{ __html: 'window.Momento ||= {};' }} suppressHydrationWarning />}
      <script dangerouslySetInnerHTML={{ __html: PLAIN_THEME }} suppressHydrationWarning />
      {/* The tags are made by this script, at the end of <head> (see SharedHead) */}
      <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_SYNC }} suppressHydrationWarning />
      {translates && <script dangerouslySetInnerHTML={{ __html: i18nLoader(false) }} suppressHydrationWarning />}
    </>
  );
}
