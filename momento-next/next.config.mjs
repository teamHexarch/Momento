/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false, // keeps the dev-mode badge off the page, so it can be compared with the original
  // The page scripts (public/legacy, public/assets) must run exactly once per page load
  // (see src/legacy/LegacyScripts.tsx), so React's development double-render is off.
  reactStrictMode: false,
  // One 404 page for the whole app (src/app/global-not-found.tsx). Needed because every page has its own root layout.
  experimental: { globalNotFound: true },
  // The pages not ported yet (and the shared scripts) still link home as "index.html". The home page is now "/".
  // Query strings (?login, ?lang=es) carry over, and the browser keeps the #section.
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: false },
      // albums.html is the page's real address (the page scripts rely on it); /albums is a convenience
      { source: '/albums', destination: '/albums.html', permanent: false },
      // groups.html was only a redirect: groups now live on the Social page, above the events
      { source: '/groups.html', destination: '/events.html#groups', permanent: false },
    ];
  },
};

export default nextConfig;
