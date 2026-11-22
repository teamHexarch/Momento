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
