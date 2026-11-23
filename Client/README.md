# Momento website (Next.js)

> **In this repo:** `Client/` is the Next.js source. GitHub builds it and publishes `Client/out` to hexarch.org
> (`.github/workflows/pages.yml`). The old HTML site is on the `html-site` branch. To run the website through the
> local server (port 4000), build it first (`npm run build` here) and start the server with `CLIENT_DIR=../Client/out`.

The Momento website, ported page by page to Next.js (App Router, TypeScript, plain CSS).
The goal of the port is that every page looks and behaves exactly like the original static site.

**Continuing this work?** Read `../NEXTJS-HANDOFF.md` (what is left and how), `PATCH-NOTES.md` (what has been done and found)
and `qa/README.md` (how to check that nothing changed).

## Run it

On Windows, double-click **`Open Momento Next preview.cmd`** (one folder up). It starts this site on
http://localhost:3001 and the original on http://localhost:3000 (if `qa/reference-site` exists), then opens both.
Or by hand:

```
npm install
npm run dev      # http://localhost:3001
npm run build    # static export into out/ (the site is hosted on GitHub Pages)
npm run preview  # serves out/ the way GitHub Pages does: http://localhost:3002
```

Locally the site answers its API calls with sample data (`public/assets/devpreview.js`), so no backend is needed.
`?dev=off` turns that off, `?dev` turns it on again (same as the original site). The real API address is set in
`public/assets/api.js` (`window.MOMENTO_API`).

## Status

| Page | State |
| --- | --- |
| Home (`/`) | Ported (`src/app/(home)/`) |
| My albums (`/albums.html`) | Ported (`src/app/(albums)/albums.html/`) |
| Social (`/events.html`) | Ported (`src/app/(events)/events.html/`) |
| Settings (`/settings.html`) | Ported (`src/app/(settings)/settings.html/`) |
| Support (`/support.html`) | Ported (`src/app/(support)/support.html/`) |
| Terms (`/terms.html`) | Ported (`src/app/(terms)/terms.html/`) |
| Privacy (`/privacy.html`) | Ported (`src/app/(privacy)/privacy.html/`) |
| 404 (any address that doesn't exist) | Ported (`src/app/global-not-found.tsx`, switched on by `experimental.globalNotFound` in `next.config.mjs`) |
| groups (`/groups.html`) | Was only a redirect stub, now a redirect to `/events.html#groups` (`next.config.mjs`) |

Every page of the original site now has a Next.js counterpart, and `public/` holds no HTML pages.

## How a page is ported (every page follows the same recipe)

- **Terms, Privacy and the 404 are the plain pages.** They have no shared page scripts, so their head is `PlainHead`
  (theme script, browser-bar colour and, for Terms and Privacy, the language loader). Terms and Privacy still translate:
  `LegacyScripts` is given an empty list, which only lets the language file start after hydration. The 404 uses absolute
  links because it appears at whatever address was mistyped, and is served with a real 404 status.

- **One root layout per page** (route groups `(home)`, `(albums)`), because each page has its own `<html data-page>`,
  its own CSS and its own head scripts. Moving between pages is a full page load, as on the original site.
- `src/styles/` holds each page's CSS exactly as it was (`home.css` / `albums.css` are the old inline `<style>` blocks;
  `glass.css`, `touch.css` (and `join-here.css` for albums) are the shared sheets). Import order matters and is kept.
- `src/components/<page>/` holds the markup as stateless server components (ids, `data-*` attributes and DOM order are
  unchanged, because the scripts look things up by them). `src/components/shared/` holds the pieces both pages use
  (the SVG sprite, the background canvas). Markup is converted from the original HTML with a script, not retyped.
- Behaviour is the original code, unchanged: `public/legacy/<page>-N.js` are the inline script blocks of the old HTML
  file, and the shared scripts are in `public/assets/`. `src/legacy/LegacyScripts.tsx` loads them in the original order
  once the page has hydrated, and replays the `DOMContentLoaded`/`load` events they expect.
- `src/legacy/SharedHead.tsx` + `headScripts.ts` hold what every page kept in `<head>`: the theme/intro boot script
  (runs before first paint), `api.js` and `guard.js` (must run while the page is being read), the theme-color tags and
  the language loader. `src/lib/metadata.ts` builds each page's title, description and link-preview tags.
- **The albums page is served at `/albums.html` on purpose.** The page scripts recognise it by that address
  (`/albums\.html$/.test(location.pathname)`), and notification links open `albums.html#album=...`. `/albums` redirects
  there. Clean URLs can come once every page is ported and the scripts are updated.
- `/index.html` redirects to `/` (the page scripts and the plain pages still link home as `index.html`).
- **`api.js` and `guard.js` are the last two scripts in `<head>`.** They add nodes to `<head>` while the page is read
  (`api.js` writes `devpreview.js` in on a developer's computer, `guard.js` adds a `<style>`), and anything added in the
  middle of `<head>` throws React's hydration off. At the end it lands after everything React rendered.
- **Page-specific bits** are options on `SharedHead` (`momentoStore`, `i18nAlways` for Settings) or live in the page's
  layout (Albums: the `#join` redirect and embed mode; Social: the map library's stylesheet is bundled from
  `src/styles/maplibre-gl.css`, and its script is loaded with its published integrity hash).
- `LegacyScripts` replays `DOMContentLoaded` for listeners on `document` **and** `window` (Settings and Support
  use `window`), and `load` for `window`.
- Links to other pages are plain `<a>` tags (a normal page load), as on the original site, because the legacy scripts
  are not yet written to be torn down on a client-side route change.

## Next steps

1. Convert the shared logic (header, footer, auth/account, toasts, theme) to React, then each page's effects, one at a
   time. Once the effects can be torn down, links between pages can become client-side navigations.
2. Move to clean addresses (`/albums` instead of `/albums.html`) once the scripts no longer look at `.html` in the path.
3. Move `assets/api.js` calls to Next API routes / the team's backend.
