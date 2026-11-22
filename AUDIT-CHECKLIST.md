# Audit checklist

Conversions made without the end-to-end checks (agreed 22 Nov 2026: convert first, check everything together at the end).
Each entry: what changed, where to look, and what might differ. Tools: `momento-next/qa/` (original on :3000, export on :3002).

Already verified before this list started: header + nav menu, static export, footer, toast, account store (see git log).

## Theme (ThemeProvider, useTheme)
- Switch from the footer, the account menu, the Settings page; another tab; device light/dark with "System".
- `qa/behave-theme.mjs`: was being stabilised (judge reduced-motion runs and end states).

## Shared shell → React (`src/components/shell/`), the five shell copies deleted
- **Dialogs** (`ShellDialog`): open/close morph from what opened them, rows rising in, backdrop fade, Escape, press
  outside, focus returns to the opener, custom cursor off while open. Phones/reduced motion: no animation.
  `[data-close]` is now one delegated listener (was per button).
- **Confirm / Ask / Choose** (Social only): text, buttons, danger styling, which button has focus, the answer on Cancel /
  X / Escape / outside. Delete an album, leave an album, Ask flows (email prompts).
- **Help**: "Contact us" hidden on Support. **Account settings**: fills from the account on open; switches; photo
  upload/remove (needs backend); name save; email-change message; "Advanced settings" hidden on Settings.
- **Create album**: album vs event, step 2 (event.js fields), group "Share with" list, errors per field, created screen
  (code, link, QR, View album, Delete). React renders it once; the logic is the old code attached in an effect.
- **Account chip + menu** (`AccountChip`): inner pages always show it ("You" until signed in); Home shows Log in / Sign up
  until signed in. Keyboard: arrows/Home/End/Escape, keyboard click focuses the first item. Theme segment. Log out (inner
  pages go home with a flash toast; Home toasts in place). inbox.js still adds its bell, menu item and dot.
  The chip is now in the server HTML on inner pages (was built by script after load).
- **Effects** (`effects.ts`): thread (Home: driven by its main loop), page-leave fade (only browsers without View
  Transitions; its click listener now registers before the page scripts', was after the first page script),
  card rim light, nav flourish (250 ms after the old scripts have loaded).
- **Momento.intro** (`intro.ts`): Home intro, skip by press/key/wheel/touch, 9 s cap, no intro when reopened scrolled.
- **Shims** still on window.Momento for the remaining page scripts: openSettings, openHelp, confirm, ask, choose,
  createAlbum, removeAlbum, inviteLink, shareInvite, intro, flourish.

## Login / sign-up (Home: `AuthDialog.tsx` + `authLogic.ts`), block removed from home-3.js
- Log in / Sign up buttons, tabs, field errors, Forgot password, Google button, captcha (needs backend config),
  new-device step (needs backend), `?login`, `?login&signup`, `?next=` invite text, scan flow from the photobook
  (`openAuth({ fromScan })`), Back button un-sticks the busy button.
- Email links: `?reset=`, `?email-approve=`, `?email=changed|taken|invalid`, `?verified=…`; tokens leave the address bar at once.
- Timing: the start-up part (open on `?login`, email-link popups) now runs once the old scripts have all run (was the
  replayed DOMContentLoaded, after the earlier home scripts' handlers): same moment, slightly different order.

## Typed API layer (`src/lib/api.ts`)
- Every endpoint the site calls, typed (User, AlbumSummary, Photo with optional miniUrl, TrashPhoto, HiddenPhoto, Group…),
  `ApiError` with status / code / challenge / retryAt. Goes through window.momentoFetch, so sample data still answers locally.
- React code now uses it: account (me), Account settings (avatar, PATCH me), chip logout, album remove/leave, Create album
  (groups, create), login (config, login, signup, google, devices, forgot/reset password, email approve/cancel).
  Check those flows' error messages too (offline, 4xx).
- Old page scripts still use window.momentoApi from api.js (guard.js needs it while the page loads).
- Language (i18n.js) was deliberately not converted yet: it translates everything the old scripts build. Convert it once
  the pages render their own text.

## Support page logic → React (`src/components/support/SupportInteractive.tsx`)
- Quick answers: one open at a time. Topic segment (pill position). Form: name/email filled from the account into empty
  fields; validation messages and the invalid field's outline; Sending… on the button; error note; "Message sent" slides in
  and takes focus; Send another slides the form back and focuses the message. Help row opens the help window.
- support-1.js keeps only the page effects (cursor, silk, glass light, buttons, header veil, page open) for the effects step.

## Page scripts moved into React-started modules (`src/page-scripts/`)
- Home, My albums, Social, Settings, Support: each page's own code (formerly public/legacy/<page>-N.js, loaded as
  <script> tags) is now one bundled module, started by <HomeScripts>/<AlbumsScripts>/... through LegacyScripts at the
  point the first old script ran (its DOMContentLoaded/load listeners queue first, as before). Code unchanged.
- Checked mechanically before moving: every page parses as a module, no undeclared assignments (strict mode), no asset
  script uses a page's top-level names.
- emoji.js is now installed by the My albums code as it starts (it reads the list at once).
- Differences to look for: a top-level error in one of Home's four old blocks used to leave the others running; now
  they are one function. Whole-page check on every page: everything that moved.
- Still not React inside: these modules drive the server-rendered markup by id/class, as before.

## Effects: one shared module (`src/components/effects/pageEffects.js`, `PageChrome.tsx`)
- My albums, Social, Settings and Support had four copies of the cursor, silk background, glass rim light, button
  fill/roll and the animation loop; now one module (drawing code unchanged). Options: Support's cursor also treats
  textareas as hoverable; My albums' glass light updates once per frame. `stop()` undoes the page-wide listeners, the
  animation frame and the WebGL context.
- My albums still calls each piece at its original point (its own code sits between them); its loop also runs its
  scroll effects. Check: cursor (dot, lens over links/buttons, hidden for touch), silk colours and the theme fade,
  glass light on panels and on later popups, button fill/roll/pull, section rules drawing on scroll (My albums).
- Support has no page script at all now: `<PageChrome>` runs its effects, the header veil and the page opening.
  The opening now starts at hydration (was once the page's scripts had loaded): the page may reveal a moment sooner.
- Home's effects (photobook, polaroids, intro) are its own and stay in src/page-scripts/home.js.

## New features (22 Nov 2026, from the "Momento update" list) — front end only
- **Camera** (`assets/event.js`): zoom slider + 1×/2×/3× chips (0.5× on wide-lens phones), pinch, mouse wheel, + / -
  keys; the lens's own zoom where the browser offers it, else digital zoom that crops the saved photo to match. Flash
  (cameras with a light), self-timer 3 s / 10 s with countdown (press shutter again to cancel), grid lines, brightness
  (where supported). Test on a real phone: the back camera's zoom, flash, front-camera mirror, photos saved at the zoom.
- **Upload formats**: the picker lists HEIC/HEIF, AVIF, JPEG XL, TIFF, the common formats and camera RAW (incl. iPhone
  ProRAW DNG); the upload confirmation lists them. Test: picking HEIC and DNG from an iPhone and a Windows PC.
- **Album sort and filter**: Sort menu (newest, oldest, file name, largest first, who added them, most reactions;
  name/size only with server data); filters (all, yours, bookmarked, with reactions, added by). Check the viewer steps
  through the filtered photos, Select clears filters, the album card cover doesn't change with the sort.
- **Viewer zoom**: − / level / + (pointer devices), + − 0 keys, Ctrl + wheel / trackpad pinch around the pointer, phone
  pinch keeps the pinched level (max 6×). Click-to-zoom and drag-to-look-around unchanged.
- **Reviews page** (`/reviews`, footer → Product → Reviews): overall score + bars (press a bar to filter), write / edit /
  delete your review (one per person), sort, show more, empty and error states, signed-out login prompt (returns to
  /reviews after logging in). Needs the backend routes in `momento-next/BACKEND-NOTES.md`; until then the live page
  shows "Reviews didn't load". New English text is not translated yet.
- Checks: `qa/feature-check.mjs` (sort, filter, zoom, camera with Chrome's fake camera), `qa/reviews-check.mjs`.
