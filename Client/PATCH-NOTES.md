# Momento patch notes

## Version 4.0: Momento on Next.js (21 to 24 November 2026)

Live on https://hexarch.org since 23 November 2026. The website is rebuilt on Next.js and looks and works the way it
did before. It also adds a better camera, sorting and filtering in albums, zoom in the photo viewer, a Reviews page,
and a few fixes.

### New for everyone

**Camera**
- A cleaner camera screen. The picture fills the screen, there's no text over it, and every control is liquid glass.
  If something goes wrong (for example, camera access is off), a small glass card explains it.
- Zoom with the 1×, 2× and 3× buttons (plus 0.5× on phones with a wide lens), by pinching with two fingers anywhere on
  the screen, with the mouse wheel, or with the + and − keys. The selected button shows the exact zoom, such as 1.5×.
  On phones that support it, the camera itself zooms. Otherwise the photo is cropped to match what you see.
- Self-timer: off, 3, 5 or 10 seconds. The time shows next to the timer button, and a glass countdown appears in the
  middle of the screen. Press the shutter again to cancel.
- Flash (on cameras that have one), grid lines, and a brightness button (brighter, darker, normal) on cameras that
  support it.
- Switch between the front and back cameras.
- Take several photos, then tap the white check button to use them. It shows how many you've taken.
- Press the last photo (bottom left) to look through everything you've taken: swipe or tap the strip to move between
  photos, delete one, or crop it. Cropping has a Free shape or 1:1, 4:3 and 16:9, a frame you drag by its corners, and a
  button to go back to the original photo.

**Uploading photos**
- More formats: HEIC and HEIF (iPhone), AVIF, JPEG XL, TIFF and camera RAW files, including iPhone ProRAW (DNG). The
  Add photos button and the upload confirmation list them.
- The upload confirmation shows every photo you picked, each with a cross to leave it out before uploading.

**My albums**
- Sort an album's photos: newest first, oldest first, file name, largest first, or most reactions. The choice is
  remembered on your device. File name and Largest first only appear once the server sends that information.
- Filter: all photos, yours, bookmarked, or photos with reactions.
- Added by: a menu to show one person's photos.
- When a filter is on, a line shows how many photos you're seeing, with a Clear button.
- Viewing a photo full size: zoom in and out with the − and + buttons on a computer, the + − and 0 keys, Ctrl and the
  mouse wheel, or a trackpad pinch. On phones, a pinch now keeps its zoom level, up to 6×.

**Reviews page** (new, at hexarch.org/reviews)
- Shows the overall score and how many reviews have each star rating. Press a star rating to see only those reviews.
- Write, edit or delete your own review (one per person). Sort by newest, highest or lowest.
- Find it in the home page's menu and in the footer under Product.
- Needs the server's review feature before it works on the live site (see KNOWN-ISSUES.md).

**Carried over from the HTML site** (added there on 21 and 22 November)
- Photo checks: your uploads that are still being checked show in a list in the album, with "Request review" for
  photos the automatic check wasn't sure about.
- Anyone can now delete photos they added. Hosts can still delete any photo in their album.
- Staff only: the Photo review page, reached from the account menu.

### Fixes
- Swiping between photos in the full-size viewer often got stuck and wouldn't move to the next photo. It now works
  every time, and the next photo shows sooner on slow connections.
- Social: the map's zoom buttons were stretched into a tall bar across the globe. They're back to normal.
- Camera timer: the time label no longer overlaps the other buttons or moves around.

### For the team
- **Where the code is:** `Client/` in the `teamHexarch/Momento` repo is now the Next.js site. Every push to `main`
  that changes `Client/` builds the site and publishes it to hexarch.org. If the build fails, nothing is published
  and the site that's already live stays up.
- **Rolling back:** the old HTML site is kept on the `html-site` branch.
- **Running it locally:**
  - `cd Client && npm install && npm run dev` (localhost:3001) for working on it
  - `npm run build && npm run preview` (localhost:3002) to see exactly what will be published
- **Backend:** `Server/` is unchanged.
  - Running the website through the local server: build first, then set `CLIENT_DIR=../Client/out`.
  - New server routes the front end expects: `Client/BACKEND-NOTES-NEXT.md`.
- **Old addresses:** links like `albums.html` and `events.html?join=…` keep working, including in emails already sent.
  New pages use clean addresses such as /albums and /reviews.
- **Under the hood:**
  - The header, footer, dialogs, notifications, account menu, login, and light and dark mode are now React
    components.
  - All server calls are in one typed file (`src/lib/api.ts`).
  - Each page's older code is now started by React instead of loading as separate files.

---

# Earlier: the port, stages 1 to 4 (21 November 2026)

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
