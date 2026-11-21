# Momento Next.js port: patch notes

**Stage 1 to 4, 21 November 2026.** Every page of the original static site is now a Next.js page that looks and behaves like the
original. This is the "wrapper" stage: the markup is React and the CSS is byte-for-byte the original, but all behaviour still
runs from the original scripts. Nothing has been converted to React logic yet (that is the next job: `../NEXTJS-HANDOFF.md`).

Stack: Next.js 16.4.6 (App Router, Turbopack), React 19.3.1, TypeScript, plain CSS. Dev server `npm run dev` on :3001.

---

## What was added

### Stage 1: foundation and Home
- Project `momento-next/`, one route group (and one root layout) per page, because each page has its own `<html data-page>`,
  its own CSS and its own head scripts.
- The original CSS copied unchanged into `src/styles/` (page sheet, then `glass.css`, then `touch.css`: the order matters).
- The page markup converted from HTML to JSX **by script**, not retyped (ids, `data-*` attributes and DOM order unchanged, because
  the scripts look elements up by them).
- `LegacyScripts` runs the original scripts, unchanged and in the original order, after hydration, and replays the
  `DOMContentLoaded` and `load` events they expect.
- `SharedHead`: the theme/intro boot script (runs before first paint), theme-color tags, language loader, metadata.
- Redirect `/index.html` to `/`.
- Dev-only guard against the browser-extension attribute that made React show "1 Issue" in dev.

### Stage 2: My albums (`/albums.html`)
- Served at `/albums.html` on purpose: the scripts test `/albums\.html$/.test(location.pathname)`.
- Keeps `#join` / `?join` redirect to Social, embed mode (`?embed=1`), deep links (`#album=`, `?album=`).
- Redirect `/albums` to `/albums.html`.
- Shared SVG sprite and background canvas moved to `components/shared`.

### Stage 3: Social, Settings, Support (`/events.html`, `/settings.html`, `/support.html`)
- Social: the map library's stylesheet is bundled from `src/styles/maplibre-gl.css` (identical to the pinned release; its hash was
  checked against the page's integrity value), so the CSS order stays as in the original. The map script still loads from the CDN
  with its integrity hash.
- Settings: `i18n.js` is loaded in English too (its language menu is built from it); the language-menu script that sat inside the
  markup is its own file (`settings-1.js`). `MomentoStore` (head script) is `public/legacy/momento-store.js`.
- `SharedHead` options for these: `momentoStore`, `i18nAlways`.

### Stage 4: Terms, Privacy, 404, groups (`/terms.html`, `/privacy.html`, any unknown address)
- Terms and Privacy: `PlainHead` (theme script, browser-bar colour, language loader). They still translate.
- 404: `src/app/global-not-found.tsx` (needs `experimental.globalNotFound`, because every page has its own root layout). Served with a
  real 404 status at any depth, absolute links, `noindex`.
- `groups.html` was only a redirect stub: now a redirect to `/events.html#groups` (query kept).
- `public/` now holds no HTML pages.

### Tooling and docs
- `qa/`: the old-vs-new checks (screenshots, click-throughs, behaviour, hydration) and `make-reference.mjs`. See `qa/README.md`.
- `.gitignore`, `README.md` (status and how a page is ported), `PATCH-NOTES.md` (this file), `../NEXTJS-HANDOFF.md` (what to do next).

---

## Bugs found while porting, and the fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Home" from another page showed a 404 | the not-yet-ported pages link to `index.html`; the home page is now `/` | redirect `/index.html` to `/` |
| React "1 Issue" in dev | a browser extension stamps `bis_skin_checked` on every element before hydration | dev-only script removes the stamp. Not present in production builds |
| Startup error `Momento.intro is not a function` | scripts that expect `DOMContentLoaded` ran after it had already fired, and their handlers ran in the wrong order | the replay queues late listeners until every script has loaded, then runs them in order |
| Spanish page was not translated, hydration failed | `i18n.js` rewrites page text before React hydrated | its start-up is held until after hydration; the page is hidden for a moment (4 s safety release) |
| Spanish tab title back in English | Next sets its own `<title>` again a few ms after `i18n.js` translated it | `LegacyScripts` keeps the translated title for 10 s |
| Two `theme-color` tags became three | the theme script changes the tags' content before hydration, so React no longer recognised them and added a copy | the two tags are created by the script itself, at the end of `<head>` |
| `format-detection` listed in another order | Next orders its `formatDetection` option differently | written as a plain tag |
| Settings and Support: name, email and avatar never filled in; page 750 px short | they listen for `DOMContentLoaded` on **window**, and the replay only covered `document` | the replay covers both |
| Settings and Support: hydration error, only on a developer's computer | `api.js` writes `devpreview.js` into `<head>` and `guard.js` adds a `<style>` while the page is read, shifting what React expects | `api.js` and `guard.js` are the last two scripts in `<head>` |
| (Caught before it was ever seen) Terms and Privacy would never translate | `LegacyScripts` given no scripts never released the held language start-up | it releases it when the list is empty |

---

## Checked against the original

Each page was compared with the original on the same machine, desktop light, desktop dark and mobile (390 wide), scrolled screen by
screen, on the dev server **and** the production build.

- **Screenshots:** Terms, Privacy, 404, Social, Settings, Support: 0 differing pixels. Home and Albums: the first screen differs by
  0.03 to 0.3 % (live QR beam, counters, lazy avatars); every other screen 0.
- **Click-throughs:** Albums 31 steps, Settings 21, Support 14, Social 21 (desktop and mobile). Screenshot and page state compared after every
  step. No differences in state; no console errors apart from the offline backend.
- **Behaviour:** intro, nav, FAQ, auth dialog, deep links (`#album=`, `#join`, `?join=`, `?group=`), redirects, signed-out redirects, dark theme,
  translations (Spanish, Arabic, French, Urdu, Chinese, Hindi), embed mode, metadata, nav and footer links (all load).
- **Terms, Privacy, 404:** every character of visible text, every element and attribute, and all head tags identical, in 6 language and
  theme combinations; hover, press and keyboard focus identical.
- **Hydration:** 20 page loads (5 pages x 4 modes: sample data on, off, Spanish, Arabic): none with errors.
- **Build:** `next build` passes; all pages are static routes.

---

## Known differences from the original (harmless)

- Home is `/`, not `/index.html` (the old address redirects). The manifest link is `/manifest.webmanifest`.
- Social: the globe's satellite tiles and camera animation differ by a few frames between runs (network timing).
- A "City Marathon is happening near you" toast (nearby-events check, about 2.5 s after load) can show a moment earlier or later.
- The 404 page is served with HTTP status 404, so the browser console logs it. (The original `404.html` opened directly returned 200.)
- Settings' language popup is no longer the very last element in `<body>` (it is a fixed-position popup, so nothing moves).
- Dev mode only: Next's overlay element and a hidden empty `<div>`.

## Not tested

Real sign-in, sign-up and email flows, photo upload (file picker) and camera, QR scanning with a camera, and anything that needs the
backend. Location was tested with a mocked position. Run these by hand against the real API.

## Things that will bite you (details in `../NEXTJS-HANDOFF.md`, section 4)

- Pages must stay at `/<name>.html` until the scripts stop testing for `.html`.
- Link between pages with plain `<a>` (full page load) until the effects can be torn down.
- Keep `api.js` and `guard.js` last in `<head>`; keep CSS import order; keep ids and DOM order until their script is gone.
- Never let PowerShell `Get-Content`/`Set-Content` rewrite files (encoding damage); keep UTF-8 without a BOM.
- Hosting: the redirects and `globalNotFound` need a Node host; a static export (GitHub Pages) needs equivalents.
