# Momento: Next.js handoff

For the developer taking the port from "pages wrapped in Next.js" to a real React web app.
Written 21 Nov 2026, and updated the same day once the last pages were ported.
Every page of the original site is now a Next.js page. The status table in `momento-next/README.md` is kept up to date;
if it ever disagrees with section 5 here, trust the README. Also read `momento-next/PATCH-NOTES.md` (what was done and what
was found) and `momento-next/qa/README.md` (how to check your work).

---

## 1. The goal, in one paragraph

The site was hand-built HTML, CSS and JS (no build step, six pages with the nav, footer and dialogs copy-pasted into
each). It has been moved into `momento-next` (Next.js 16.4.6, React 19.3.1, App Router, TypeScript, plain CSS).
That first move is deliberately a **wrapper**: markup became JSX, CSS was copied byte for byte, and the original
scripts still run unchanged. Your job is to turn that into a **true React app**, one piece at a time, without the site
ever looking or behaving differently. The owner's rule, repeated through every earlier session: **identical to the
original, nothing restyled, nothing "improved"**.

The backend is a separate job done by the owner's team. Do not build it here.

---

## 2. Read these first (in this order)

1. `CLAUDE (1).md` (project root): the owner's frontend rules. Key ones: only animate `transform` and `opacity`, never
   `transition-all`, every clickable thing needs hover, focus-visible and active states, never default Tailwind colours,
   screenshot and compare at least twice, always serve on localhost.
2. `momento-next/README.md`: how a page is ported and the current status table.
3. `momento-next/AGENTS.md`: **this Next.js is not the one you know.** Read the relevant guide in
   `momento-next/node_modules/next/dist/docs/` before writing Next code, and heed deprecation notices.
4. `BACKEND-NOTES (1).md` and `SERVER-TRASH-API (1).md`: every API endpoint and response shape the front end uses.
   These become your TypeScript types.
5. `momento-next/src/legacy/LegacyScripts.tsx`: the bridge you are going to dismantle. Understand it before touching
   anything else.

The project root also still holds the original files, all with a stray " (1)" in their names (`index (1).html`,
`assets (1)\glass (1).css`). The HTML references clean names, so they cannot run as they are. Treat them as the
**read-only source of truth** for how each page should look.

---

## 3. Run it

```
cd momento-next
npm install
npm run dev          # http://localhost:3001
npm run build && npm run preview   # the static export (out/), served like GitHub Pages on :3002. Use this for any
                                   # production or speed check; it is exactly what gets uploaded
```

- Locally the site answers API calls with sample data from `public/assets/devpreview.js` (signed in, sample albums).
  `?dev=off` turns it off, `?dev` back on, `?dev=reset` restarts the sample data.
- The real API address is `window.MOMENTO_API` in `public/assets/api.js` (production: `https://api.hexarch.org`;
  local: `http://localhost:4000`).
- **Set up the QA toolbox before changing anything** (`momento-next/qa/README.md`). It builds a permanent copy of the original
  site with the " (1)" stripped from every name (`node qa/make-reference.mjs "<original folder>"`), serves it on :3000, and
  compares old against new with screenshots, click-throughs and behaviour checks. Every change you make is checked against it.

---

## 4. How it works today (the architecture you inherit)

```
momento-next/
  src/app/(home)/        page.tsx + layout.tsx     one root layout PER page (own <html data-page>)
  src/app/(albums)/ (events)/ (settings)/ (support)/ (terms)/ (privacy)/   same shape: layout.tsx + <name>.html/page.tsx
  src/app/global-not-found.tsx   the 404 page for every address that does not exist
  src/components/<page>/ stateless server components: the markup, converted from the old HTML by script
  src/components/shared/ SvgSprite, Backdrop (canvas)
  src/styles/            each page's old inline <style> verbatim (home.css, albums.css ...) + glass.css, touch.css
  src/legacy/            LegacyScripts.tsx, SharedHead.tsx, headScripts.ts   <- the bridge
  src/lib/metadata.ts    title, description, link-preview tags
  public/legacy/         <page>-N.js : the old inline <script> blocks, verbatim, concatenated in original order
  public/assets/         the old shared scripts (api.js, extras.js, guard.js, qr.js, event.js ...), fonts, images
  public/                legacy/ and assets/ (scripts, images, fonts, i18n), CNAME, manifest, service worker. No HTML pages left.
  qa/                    old-vs-new checks (screenshots, click-throughs, behaviour) + make-reference.mjs   <- use these
```

How a page runs: the server renders the static markup; after hydration `LegacyScripts` appends the old scripts to the
page one by one in the original order (`async = false`); they find elements by id and class and drive everything
(silk WebGL background, cursor, scroll-driven photobook, intro, nav, login, account, footer injection, create-album).

### Things that are intentional but ugly (and why)

| Quirk | Reason | Goes away when |
| --- | --- | --- |
| One root layout per page, so every page change is a **full page load** | each page has its own `<html data-page>`, head scripts and CSS | a single root layout and `next/link` navigation (Phase 5) |
| `reactStrictMode: false` in `next.config.mjs` | the old scripts must run exactly once; React dev double-render would run them twice | the scripts are replaced by hooks with cleanup |
| `LegacyScripts` replaces `document.addEventListener` and `window.addEventListener` for a moment | the scripts expect `DOMContentLoaded` and `load` still to come; after hydration they are already past | the scripts are gone |
| The albums page is served at **`/albums.html`** | scripts test `/albums\.html$/.test(location.pathname)`, and notification links open `albums.html#album=...` | scripts updated, then clean URLs (Phase 5) |
| `/index.html` redirects to `/`; `/albums` to `/albums.html`; `/groups.html` to `/events.html#groups` | the page scripts and the plain pages still link to the old addresses | clean URLs (Phase 5); keep the redirects anyway |
| All scripts share one global scope and `window.Momento` | they were inline blocks in one HTML file | each becomes a module |
| Links between pages are plain `<a>` tags | scripts are not written to be torn down on a client-side route change | Phase 5 |
| `api.js` and `guard.js` are the LAST two scripts in `<head>` | they insert nodes into `<head>` while the page is read (the sample-data script, a `<style>`); in the middle of `<head>` that breaks React hydration | the scripts are gone |
| `i18n.js` is written into `<head>`, but its start-up is held until after hydration (`I18N_LOADER` in `headScripts.ts`); non-English pages are hidden for a moment (`i18n-pending`) | it rewrites page text, which would no longer match the server HTML | translation becomes a React provider |
| `LegacyScripts` also keeps the translated tab title | Next puts the English `<title>` back a few ms after `i18n.js` translates it | translation becomes a React provider |
| The theme-color tags are created by script; `format-detection` is a plain tag (`other` in `lib/metadata.ts`) | Next adds a duplicate theme-color tag after the theme script changed it, and writes `format-detection` in another order | scripts gone |
| `experimental.globalNotFound` plus `src/app/global-not-found.tsx` | one 404 page for an app with several root layouts | single root layout (Phase 1): then use a normal `app/not-found.tsx` |
| A dev-only script strips `bis_skin_checked` (`EXTENSION_ATTR_GUARD`) | the owner's browser extension stamps it on every element, which React reports as a hydration error in dev | never needed in production; remove whenever you like |

---

## 5. Where things stand

- **Ported (React markup + the original scripts): every page.** Home (`/`), My albums, Social, Settings, Support, Terms, Privacy
  (`/<name>.html`), the 404 page (`src/app/global-not-found.tsx`) and `groups.html` (now a redirect in `next.config.mjs`).
  `public/` holds no HTML pages any more.
- **Verified against the original** (details in `PATCH-NOTES.md`): pixel diff about zero on every page in light, dark and mobile;
  click-throughs and behaviours match; Terms, Privacy and 404 text and structure identical in 6 languages; dev and production
  builds; no hydration errors.
- **Not converted yet: everything in Phase 1 onwards.** The markup is React, but all behaviour is still the original scripts:
  about 840 KB in `public/legacy/` and about 430 KB in `public/assets/`, all un-minified. Nothing has been converted from
  "legacy script" to "React".
- **Not tested** (needs a real backend or a device): real sign-in, sign-up and email flows, photo upload and the camera, QR
  scanning with a camera. Location was tested with a mocked position.

---

## 6. Roadmap to a true React app

Work in this order. Each phase ends with a check the previous section's rules apply to: **screenshot old against new,
light and dark, 1440 and 390 wide, reduced motion, no console errors**. Do not start a phase until the one before is
accepted.

### Phase 0: safety net (do this before any conversion)
1. **`git init` the project.** Still not done: it is not a git repository, so there is no history and no way to undo. A
   `.gitignore` is already in `momento-next/`. Commit the starting state first, then one component per commit.
2. Make the permanent reference copy: written as a script, `node qa/make-reference.mjs` (section 3). Run it on your machine.
3. The visual-regression and click-through scripts are written and live in `qa/` (`compare.mjs`, `interact.mjs`,
   `interact-pages.mjs`). Run the old site against itself first to learn the noise floor (`qa/README.md`).
4. Behaviour checks for every page are in `qa/` too (`behave*.mjs`; `hyd.mjs` for hydration). Add a check for anything you convert.
5. Add ESLint (Next config) and run `tsc --noEmit` in CI or a pre-commit hook.
6. Done: every page is ported and verified, and the README status table is current.

### Phase 1: one root layout, proper head, fonts, metadata
1. Replace the per-page root layouts with **one `app/layout.tsx`**. `<html data-page>` becomes a client-set attribute
   (the boot script already sets `data-theme` before paint; do the same for `data-page`, or use a small client
   component). Keep the boot script (theme and intro flags before first paint) exactly as is.
2. Move Google Fonts to `next/font` (Inter, Caveat) **only if the rendering is pixel-identical**; otherwise keep the
   `<link>`.
3. Move each page's title, description, Open Graph and Twitter tags, canonical and JSON-LD into the Metadata API.
   Values must not change.
4. Keep CSS import order exactly as the originals (page CSS, then `glass.css`, then `touch.css`). Order matters.
   Do **not** merge or reformat the CSS in this phase.
5. **Watch for CSS collisions: this is the main risk of Phase 1.** Today each page is its own document, so each page's CSS is
   free to style bare elements: `body`, `h1`, `main`, `footer`, `a`, `table`, and Terms/Privacy even set
   `* { scrollbar-width: none !important }`. The app pages and the plain pages (Terms, Privacy, 404) use different, conflicting
   rules for the same elements. With one root layout, stylesheets from several pages can end up loaded together. Decide how to
   scope them before merging layouts (for example prefix every page's rules with `[data-page="..."]`, or CSS modules), do it
   mechanically, and check it with `qa/compare.mjs` on every page. The 404 page keeps its own document (`global-not-found`) either way.

### Phase 2: shared pieces as real React components
These are duplicated in every page today, so this is where most of the value is. Find where each lives first
(search `public/assets/extras.js`, and the shared block inside each `public/legacy/<page>-N.js`).

The shared shell is the same ~1,080-line block pasted into five pages: `home-5.js`, `albums-2.js`, `events-2.js`, `settings-3.js` and
`support-2.js` (about 68 KB each). `albums-2` and `settings-3` are identical; `events-2` adds `Momento.choose` and an
`openAlbumHere` hook; `support-2` differs by one line (its `NOTIFY` default lacks `activity: true`, which Albums, Settings and
Social have); `home-5` lacks `activity: true` too, and drives the thread effect from Home's main loop instead of its own
`requestAnimationFrame`.

**i18n.js and React-rendered elements.** `i18n.js` translates text nodes in place (`nodeValue`) and attributes
(`setAttribute`), which React tolerates. But a sentence broken up by inline tags (`<b>4</b> of <b>9</b> guests`) is rebuilt
with `el.replaceChildren(...)`, and if React later re-renders that element it will try to update nodes that are gone and
crash. Until translation is a React provider (step 5 below), an element React re-renders must not contain inline-tag sentences. Diff them first, and make the React version cover
the union. Everything the pages call lives on `window.Momento`: `theme`, `account`, `sessionReady`, `openSettings`, `openHelp`,
`toast`, `flash`, `confirm`, `ask`, `choose` (Social only), `inviteLink`, `shareInvite`, `removeAlbum`, `createAlbum`, `intro`,
`flourish` (all in that block), plus `qr`, `event`, `myGroups`, `chooseLanguage`, `groupLink`, `albumSettings`, `openJoin`,
`joinFromQr`, `isRawFile`, `uploadLimits`, `cropAvatar` and `i18n` (in `public/assets/*.js` and the page blocks). That list is
your to-do list: each name is either replaced by a hook or kept as a shim until its last caller is gone.

Convert in this order, one component per step, each replacing its legacy code on **every** page at once:
1. `Header` and `Nav` (logo, nav items, active-item indicator, hover and focus states, the theme-switch view
   transition).
2. `SiteFooter` (currently injected by JS into `<footer data-site-foot>`; render it from React instead).
3. `Dialog` primitive (the `.acct-dialog` / `.acct-card` glass slab), then `Toast` and `Confirm`
   (`Momento.toast`, `Momento.confirm`), exposed as a React context plus hook (`useToast`, `useConfirm`).
4. `AccountChip` and account menu, `AuthDialog` (login, sign up, forgot password, validation), the reset-password
   and approve-email popups.
5. Language loader (`i18n.js`) and theme (`Momento.theme`) as a provider and hook.

Rule while the old scripts still exist elsewhere: keep `window.Momento.*` working as a thin **shim over the new React
code**, so a not-yet-converted page keeps functioning. Delete a shim only when nothing calls it
(`grep -r "Momento\." src public`).

### Phase 3: typed API layer
1. Create `src/lib/api.ts`: one typed client replacing `window.momentoApi` and `momentoFetch`
   (cookies via `credentials: 'include'`, base URL from an env var, errors with a readable `.message`).
2. Write types from `BACKEND-NOTES (1).md` and `assets/devpreview.js`: `User`, `Album`, `AlbumSummary`, `Photo`
   (note the optional `miniUrl`), `TrashPhoto`, `Group`, `Event`.
3. Add a data-fetching layer (TanStack Query or SWR) with caching and optimistic updates for like, save and hide.
4. Keep the sample-data mode, but as a **mock adapter** behind the same client (dev only, never in a production
   build), not a monkey-patch of `fetch`. Keep its endpoints and shapes identical so the backend team can still use it
   as a reference.
5. Do not call endpoints the server does not have. The backend to-do list is at the bottom of
   `BACKEND-NOTES (1).md`.

### Phase 4: convert page logic to React, one page at a time
Terms, Privacy and the 404 page have no page logic (the first two only translate), so they are finished once translation is a React
provider. Order the rest by size and risk: **Support** then **Settings** then **Events/Social**
then **My albums** (largest: `albums-1.js` is about 185 KB) then **Home** (most visual effects).

For each page:
1. Split the page into sections as components. Local state with hooks; shared state in context.
2. Re-implement each legacy block as a hook or component, in the same order the old script ran, deleting that block
   from `public/legacy/<page>-N.js` as you go. The page must still work after **each** deletion.
3. When the last block is gone, remove the page's entry from `LegacyScripts`.
4. Run the regression and behaviour tests. Do not move on until clean.

Page notes:
- **My albums:** the album window becomes a grid with select mode, a Recently deleted bin (30-day retention, restore,
  delete forever) and a full-screen viewer. Keep the **embed contract**: the Events page loads
  `albums.html?album=<id>&embed=1[&upload=1]` in an iframe; the album page must post
  `{type:'momento:album', state:'ready'}` to its parent when open and `state:'closed'` when closed.
  Do not break this when URLs change.
- **Events/Social:** one overview page (needs-you panel, groups tiles with a side panel, events near you with map).
  Group chat and event chat were **removed on purpose**; do not rebuild them. Old links must keep working:
  `#groups`, `#events`, `#alerts`, `#join`, `?join`, `?event`, `#album=`.
- **Home:** last, because it holds the scroll-driven photobook, the QR card and floating Polaroids, the intro, and the
  How it works scroller.

### Phase 5: effects as hooks, then real navigation
1. Wrap each visual effect in a component or hook that **starts on mount and cleans up on unmount** (cancel
   `requestAnimationFrame`, remove listeners, dispose the WebGL context): silk background, cursor, glass rim light,
   button fill and roll, scroll depth, intro. Keep the drawing code itself as is. The effects do not need rewriting,
   only lifecycle. Use one shared animation loop, as the original does.
2. Only once every effect cleans up properly: switch to a single layout and `next/link` client-side navigation, turn
   `reactStrictMode` back on, and re-apply the cross-page view transition (header stays put, active nav item glides).
3. Move to clean URLs (`/albums`, `/events`, ...) **last**. This touches: scripts that test `albums.html`, notification
   links, QR codes, email links (`?reset=`, `?email-approve=`, `?email=`, `?login=1&next=`), the service worker, the
   sitemap and the embed iframe URL. Keep redirects from every old URL.

### Phase 6: production hardening
1. **Hosting: decided 21 Nov 2026, GitHub Pages** (the owner's existing Pages site, which hosts the HTML version today).
   So the finished app must be a static export: no API routes, server actions, middleware, `redirects()` or request-time
   rendering in new code. Until it's finished it is only run locally for testing. Background: `public/CNAME` suggests the site is on GitHub Pages (static) with the API on
   `api.hexarch.org`. `next.config.mjs` uses `redirects()`, which needs a Node server and does **not** work with a
   static export (`output: 'export'`). Redirects in use: `/index.html`, `/albums`, `/groups.html`. The 404 page uses the experimental
   `globalNotFound` flag. Either pick a host that runs Next.js, or replace the redirects with static equivalents and check that a
   static export still produces `404.html` (GitHub Pages serves it for any unknown address).
2. Use the `miniUrl` thumbnail where present (falls back to `thumbnailUrl`); move images to `next/image` where it does
   not change how they look.
3. Accessibility pass: focus order, visible focus rings, labels, `aria-live` on counts and toasts, dialogs trap focus,
   reduced motion fully respected, contrast in both themes.
4. Error boundaries and empty/error states: say what went wrong and how to fix it.
5. Keep `manifest.webmanifest` and `sw.js` working; update the service worker's cache list when routes change.
6. Bundle size: the legacy scripts total about 1.2 MB of un-minified JS (about 840 KB in `public/legacy`, 430 KB in `public/assets`). Each deletion should shrink the build; track it.
7. Security carry-overs: tokens in the URL (`?reset=`, `?email-approve=`) are removed from the address bar immediately
   (`history.replaceState`); keep `<meta name="referrer" content="strict-origin-when-cross-origin">` on every page;
   sign-up sends `acceptTerms` and `termsVersion`.

### Phase 7 (optional, later): app-store app
Easiest: Add to Home Screen (PWA, already half there). Next: wrap in Capacitor. A native React Native app would reuse
the team's React knowledge and API layer but not the screens or the WebGL effects. The silk background and
scroll-driven album would be the first things to simplify on a phone.

---

## 7. Rules for every change

- **Identical or it isn't done.** A conversion that changes how anything looks, moves or sounds is a bug.
- **Convert, then delete.** Never leave both the old script and the new component driving the same element.
- **Keep ids, `data-*` attributes and DOM order** until the script that reads them is gone.
- **Never rewrite files with PowerShell `Get-Content`/`Set-Content`** (encoding damage). Use an editor, Node, or
  `Set-Content -Encoding utf8` with care; files must stay UTF-8 without a BOM. Check for stray `â€”` style characters.
- Animate only `transform` and `opacity`; no `transition-all`; give every control hover, focus-visible and active
  states.
- Do not add features, copy or sections that are not in the original.
- Do not edit `public/assets/devpreview.js` response shapes without telling the backend team.
- Commit small and often, one component per commit, so any step can be reverted.

## 8. Definition of done for one converted piece

- [ ] The legacy code for it is deleted, and nothing still calls its old `window.Momento.*` entry.
- [ ] Old versus new screenshots match: light and dark, 1440 and 390, reduced motion, several scroll positions.
- [ ] Behaviour test passes, including keyboard use and the focus ring.
- [ ] No console errors or hydration warnings; `npm run build` passes; `tsc --noEmit` and lint are clean.
- [ ] No leaked listeners, timers or WebGL contexts after navigating away (check in DevTools).
- [ ] README status table updated.

## 9. Questions to put to the owner before Phase 5 and 6

1. Where will this be hosted (static GitHub Pages or a Node host)?
2. Will the server code live inside this Next.js project (API routes) or stay a separate Express service?
3. Is a phone app in scope, and if so PWA, Capacitor or native?
4. `BACKEND-NOTES (1).md` mentions a swipe sorter (`sort.html`) that the footer still links to, but there is no
   `sort.html` in this folder. Is it meant to exist, or should the footer link go?
