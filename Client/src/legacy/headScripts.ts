// Everything the original pages kept in <head>, shared by every ported page (see SharedHead.tsx).
// Language: English needs nothing more, so assets/i18n.js (73 KB) only loads when another language is chosen.
// The page scripts expect window.Momento to exist.
// i18n.js must be written in while the page is still being read (it document.write()s its language file), but
// it also rewrites the page text, which would no longer match what the server sent when React hydrates. So its
// start-up (the MutationObserver it creates and its DOMContentLoaded handler) is held back here and released by
// LegacyScripts right after hydration. Until then the page stays hidden (4 s safety release): no flash of English.
//
// Settings is the exception: its language menu is built from i18n.js, so it loads it for English too (i18n.js
// does nothing to the page in English; it only registers Momento.i18n and sets <html lang>).
const i18nLoaderTemplate = `
(() => {
  let l = 'en'; try { l = localStorage.getItem('momento-lang') || 'en'; } catch (e) {}
  l = new URLSearchParams(location.search).get('lang') || l;
  if (l === 'en') { __ENGLISH__ return; }
  const root = document.documentElement;
  root.classList.add('i18n-pending');
  setTimeout(() => root.classList.remove('i18n-pending'), 4000);
  const held = [], RealMO = window.MutationObserver, realAdd = document.addEventListener;
  const putBack = () => { window.MutationObserver = RealMO; delete document.addEventListener; };
  // i18n.js creates its observer first and then adds its DOMContentLoaded listener; each is held, and the
  // normal ones are put back as soon as i18n.js has used them (with a safety net in case it never loads)
  window.MutationObserver = class extends RealMO { observe(...a) { held.push(() => super.observe(...a)); window.MutationObserver = RealMO; } };
  document.addEventListener = function (type, fn, opts) {
    if (type === 'DOMContentLoaded') { held.push(() => fn.call(document, new Event(type))); putBack(); }
    else realAdd.call(document, type, fn, opts);
  };
  setTimeout(putBack, 4000);
  window.__momentoI18n = { release() { held.splice(0).forEach((run) => run()); } };
  document.write('<script src="/assets/i18n.js"><\\/script>');
})();
`;

export const i18nLoader = (alsoInEnglish: boolean) =>
  i18nLoaderTemplate.replace('__ENGLISH__', alsoInEnglish ? `document.write('<script src="/assets/i18n.js"><\\/script>');` : '');

// Runs before first paint, so the page never flashes the wrong theme (unchanged from index.html)
const bootTemplate = `
(() => {
  const root = document.documentElement;
  let pref = 'system';
  try { pref = localStorage.getItem('momento-theme') || 'system'; } catch (e) {}
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themePref = pref;
  window.__theme = { target: +dark, a: +dark, b: +dark };   // read by the silk shader

  // Signed in (or known to be signed out) earlier in this tab: the header shows the right buttons from the first
  // paint, not the signed-out ones until the server has answered (AccountProvider keeps these classes up to date)
  try {
    if (sessionStorage.getItem('momento-account')) root.classList.add('has-account');
    else if (sessionStorage.getItem('momento-guest') === '1') root.classList.add('is-guest');
  } catch (e) {}

  // Pages opened straight from the folder (file://) can't cross-fade into each other, so the page
  // that was left marks it, and this one rises in instead (see "Leaving a page")
  try {
    if (sessionStorage.getItem('momento-pt') === '1') {
      sessionStorage.removeItem('momento-pt');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.classList.add('is-arriving');
        setTimeout(() => root.classList.remove('is-arriving'), 900);
      }
    }
  } catch (e) {}

  // The page intro plays once per tab session (and on ?intro). It is skipped for reduced motion, for
  // links into a section (#faq) and when the page is reopened part-way down. Until it ends, a
  // veil (#intro) covers the page; if the script that runs it never loads, the veil is lifted anyway
  try {
    const page = root.dataset.page, seen = sessionStorage.getItem('momento-intro-' + page);
    if (__INTRO_PAGE__ && !matchMedia('(prefers-reduced-motion: reduce)').matches && (/[?&]intro\\b/.test(location.search) || (!seen && !location.hash))) {
      root.classList.add('intro-on');
      const lift = () => {
        if (!root.classList.contains('intro-on')) return;
        root.classList.remove('intro-on');
        document.dispatchEvent(new Event('momento:intro-reveal')); document.dispatchEvent(new Event('momento:intro-end'));
      };
      // Not started 3.5 s in (its script is slow or failed): the page is shown rather than a blank veil. Once it has
      // started (.intro-run) it ends itself; 10 s is the last resort either way
      setTimeout(() => { if (!root.classList.contains('intro-run')) lift(); }, 3500);
      setTimeout(lift, 10000);
    }
  } catch (e) {}
})();
`;

// Browser bar colour follows the chosen theme. (index.html ran this right after the two theme-color tags; here the
// tags are written by Next, so the lookup happens each time instead of once.)
// The two theme-color tags are made here, not rendered by React: this script changes their content before React
// hydrates, so React would no longer recognise them and would add a second copy. This script is the last thing in
// <head>, so the tags land after everything React rendered.
export const THEME_COLOR_SYNC = `
(() => {
  const r = document.documentElement;
  for (const scheme of ['light', 'dark']) {
    const m = document.createElement('meta');
    m.name = 'theme-color'; m.content = scheme === 'dark' ? '#121119' : '#ECECF3'; m.media = '(prefers-color-scheme: ' + scheme + ')';
    document.head.append(m);
  }
  const sync = () => { if (!r.dataset.theme) return; const c = r.dataset.theme === 'dark' ? '#121119' : '#ECECF3'; document.querySelectorAll('meta[name="theme-color"]').forEach((x) => { x.content = c; }); };
  sync(); document.addEventListener('DOMContentLoaded', sync); new MutationObserver(sync).observe(r, { attributes: true, attributeFilter: ['data-theme'] });
})();
`;

// Development only. Some browser extensions (e.g. Bitdefender's TrafficLight) stamp `bis_skin_checked` on every
// element before React hydrates, and React's dev overlay reports that as a hydration error ("1 Issue"). The site
// is fine; this just removes those stamps as they appear. It is not included in production builds.
export const EXTENSION_ATTR_GUARD = `
(() => {
  const ATTRS = ['bis_skin_checked'];
  const strip = (el) => ATTRS.forEach((a) => el.removeAttribute && el.removeAttribute(a));
  const sweep = () => document.querySelectorAll('[bis_skin_checked]').forEach(strip);
  new MutationObserver((records) => records.forEach((r) => {
    if (r.type === 'attributes') strip(r.target);
    else r.addedNodes.forEach((n) => { if (n.nodeType === 1) { strip(n); n.querySelectorAll && n.querySelectorAll('[bis_skin_checked]').forEach(strip); } });
  })).observe(document, { attributes: true, attributeFilter: ATTRS, childList: true, subtree: true });
  sweep();
})();
`;

// Inter starts downloading with the page, except on Apple devices: there the font stacks' first choice, the system font
// (-apple-system), is always there, so Inter is never used. It is added at the end of <head> (see THEME_COLOR_SYNC).
export const INTER_PRELOAD = `
(() => {
  if (/Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  const l = document.createElement('link');
  l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = ''; l.href = '/assets/fonts/inter-latin.woff2';
  document.head.append(l);
})();
`;

// Page switches: when the pointer rests on a link to another Momento page (or it is pressed, on touch), Chrome and Edge
// fetch that page ahead, so the click opens it straight from memory. Only the page itself is fetched (no scripts run
// until it is opened). Browsers without speculation rules ignore this tag.
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [{
    source: 'document',
    where: {
      and: [
        { href_matches: '/*' },
        { not: { href_matches: '/assets/*' } },
        { not: { href_matches: '/*?*embed*' } },   // (URL pattern: the part after ? is the query)
        { not: { selector_matches: '[target], [download], [rel~="nofollow"]' } },
      ],
    },
    eagerness: 'moderate',
  }],
});

export const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Momento',
  alternateName: ['Momento by Hexarch', 'momento.hexarch.org'],
  url: 'https://momento.hexarch.org/',
});

// The intro veil. index.html's copy of this block tests `page &&`; albums.html's copy tests `page === 'home' &&`
// (so it never plays there). Same generated block, one differing condition, kept exactly per page.
export const bootScript = (variant: 'home' | 'inner') =>
  bootTemplate.replace('__INTRO_PAGE__', variant === 'inner' ? "page === 'home'" : 'page');