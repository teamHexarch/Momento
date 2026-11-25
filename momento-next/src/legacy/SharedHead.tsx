import { preload } from 'react-dom';
import {
  EXTENSION_ATTR_GUARD,
  INTER_PRELOAD,
  JSON_LD,
  SPECULATION_RULES,
  THEME_COLOR_SYNC,
  bootScript,
  i18nLoader,
} from './headScripts';

/**
 * The part of <head> every Momento page shares, in the order the original pages had it.
 * Rendered inside each root layout's <head>.
 *
 * suppressHydrationWarning on the scripts: api.js writes devpreview.js into <head> while the page is read (local
 * sample-data mode), and i18n.js/its language file are written in after the loader, so React can find extra
 * <script> tags it did not render. They are never touched again, so there is nothing to patch up.
 */
export default function SharedHead({
  variant,
  handwriting = false,
  jsonLd = false,
  momentoStore = false,
  i18nAlways = false,
}: {
  /** 'home' plays the intro veil on a first visit; every other page ('inner') does not */
  variant: 'home' | 'inner';
  /** Home: its cards use the handwriting font (Caveat) as well as Inter (src/styles/fonts.css) */
  handwriting?: boolean;
  /** the home page declares itself as a WebSite for search engines */
  jsonLd?: boolean;
  /** Settings and Support: the browser-side album list (window.MomentoStore) is made in <head> */
  momentoStore?: boolean;
  /** Settings: assets/i18n.js is loaded in English too (its language menu is built from it) */
  i18nAlways?: boolean;
}) {
  // The fonts are this site's own files (src/styles/fonts.css); the Latin ones start downloading straight away
  // (Inter: INTER_PRELOAD below, which skips Apple devices, where it's never used)
  if (handwriting) preload('/assets/fonts/caveat-latin.woff2', { as: 'font', type: 'font/woff2', crossOrigin: '' });
  return (
    <>
      {process.env.NODE_ENV !== 'production' && (
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_ATTR_GUARD }} suppressHydrationWarning />
      )}
      <style dangerouslySetInnerHTML={{ __html: 'html.i18n-pending body { visibility: hidden; }' }} />
      <script dangerouslySetInnerHTML={{ __html: 'window.Momento ||= {};' }} suppressHydrationWarning />
      <script dangerouslySetInnerHTML={{ __html: bootScript(variant) }} suppressHydrationWarning />
      {momentoStore && <script src="/legacy/momento-store.js" suppressHydrationWarning />}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} suppressHydrationWarning />}
      <script type="speculationrules" dangerouslySetInnerHTML={{ __html: SPECULATION_RULES }} suppressHydrationWarning />
      {/* Browser bar colour: the tags are made (and kept in step with the chosen theme) by this script, which sits
          at the end of <head> so they land after everything React rendered. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_SYNC }} suppressHydrationWarning />
      <script dangerouslySetInnerHTML={{ __html: INTER_PRELOAD }} suppressHydrationWarning />
      {/* Last in <head> on purpose: i18n.js and its language file are written in right after this script, so they
          land after everything React rendered and can't shift it. */}
      <script dangerouslySetInnerHTML={{ __html: i18nLoader(i18nAlways) }} suppressHydrationWarning />
      {/* api.js and guard.js must run while the page is still being read (api.js writes devpreview.js in on a
          developer's computer, guard.js adds a <style> and hooks DOMContentLoaded). They add nodes to <head> as
          they run, so they go last: anything they add then lands after everything React rendered. Nothing above
          needs them yet. */}
      <script src="/assets/api.js" suppressHydrationWarning />
      <script src="/assets/guard.js" suppressHydrationWarning />
    </>
  );
}
