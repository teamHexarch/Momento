import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/**
 * The site is hosted on GitHub Pages (static files only), so `next build` makes a static export into `out/`
 * (then `scripts/finish-export.mjs` tidies it for GitHub Pages: see that file). Test the export locally with
 * `npm run preview`, which serves `out/` the way GitHub Pages does.
 *
 * `npm run dev` is not an export, so it keeps two redirects that GitHub Pages gives us for free:
 *   /index.html -> /       (on GitHub Pages, out/index.html simply is the home page)
 *   /albums     -> /albums.html   (GitHub Pages serves name.html for /name)
 * groups.html is the original redirect page itself, in public/, so it behaves the same everywhere.
 */
export default function nextConfig(phase) {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  /** @type {import('next').NextConfig} */
  const config = {
    devIndicators: false, // keeps the dev-mode badge off the page, so it can be compared with the original
    // The page scripts (public/legacy, public/assets) must run exactly once per page load
    // (see src/legacy/LegacyScripts.tsx), so React's development double-render is off.
    reactStrictMode: false,
    // One 404 page for the whole app (src/app/global-not-found.tsx). Needed because every page has its own root layout.
    experimental: { globalNotFound: true },
  };
  if (!dev) config.output = 'export';
  else {
    config.redirects = async () => [
      { source: '/index.html', destination: '/', permanent: false },
      { source: '/albums', destination: '/albums.html', permanent: false },
    ];
  }
  return config;
}
