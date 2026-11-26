import type { Viewport } from 'next';
import SharedHead from '@/legacy/SharedHead';
import { pageViewport } from '@/lib/metadata';

// Same order as the original page: the page's own styles first, then the shared glass + touch sheets, then the
// join-here sheet (the "join with a code" helper that albums.html adds)
import '@/styles/albums.css';
import '@/styles/fonts.css';   // the site's own web fonts (Inter, and Caveat on Home)
import '@/styles/glass.css';
import '@/styles/touch.css';
import '@/styles/nav-extra.css';   // the header menu's Reviews link
import '@/styles/join-here.css';
// The album window's sort and filter row, and the viewer's zoom controls (new: after the original sheets)
import '@/styles/album-tools.css';
// Event games: the Games button, the arcade strip, the Games window and the winners' celebration (after glass.css,
// so the Games button's rainbow wins over the plain glass)
import '@/styles/games.css';

export const viewport: Viewport = pageViewport;

// An old link that asks to join an album lands on the Social page, where joining lives
const JOIN_REDIRECT = `if (location.hash === "#join" || new URLSearchParams(location.search).has("join")) location.replace("events" + location.search + location.hash);`;

// Embedded (albums.html?album=<id>&embed=1 inside another Momento page): only the album window shows,
// over the page that opened it. Links leave to the top page; no intro plays. (The rules for html.is-embed are
// at the top of albums.css.)
const EMBED = `
(() => {
  if (window.parent === window || !new URLSearchParams(location.search).has('embed')) return;
  try { if (window.parent.location.origin !== location.origin) return; } catch (e) { return; }
  document.documentElement.classList.add('is-embed');
  const base = document.createElement('base'); base.target = '_top'; document.head.append(base);
  try { sessionStorage.setItem('momento-intro-albums', '1'); } catch (e) {}
})();
`;

export default function AlbumsLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-theme-pref / is-embed are set by scripts before React hydrates
    <html lang="en" data-page="albums" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JOIN_REDIRECT }} suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: EMBED }} suppressHydrationWarning />
        <SharedHead
          variant="inner"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
