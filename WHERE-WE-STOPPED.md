# Where we stopped (21 Nov 2026, evening)

Read this first tomorrow, then `NEXTJS-HANDOFF.md` and `momento-next/qa/README.md`.

## Git

- `main`: everything verified against the original.
  - `d5408c1` starting state (wrapper port + original site files)
  - `935f323` Header: one React `SiteHeader` + `NavWrap` (nav menu) replacing four copies
  - `72107b4` Static export for GitHub Pages (`npm run build` → `out/`, `npm run preview` on :3002)
- `wip/shared-shell` (checked out): the next batch, **written but not fully verified yet**. One commit on top of main:
  - `SiteFooter` (replaces the footer the shared script injected): verified identical (`qa/behave-footer.mjs`, full suite)
  - `Toaster` (`Momento.toast` / `Momento.flash` shim): verified identical (`qa/behave-toast.mjs`, full suite)
  - `ThemeProvider` + `useTheme` (`Momento.theme` shim): targeted test still being made reliable (see below)
  - `AccountProvider` + `useAccount` (`Momento.account` / `sessionReady` shim): verified identical on the export
    (`qa/behave-account.mjs`, all app pages, signed in and out)
  - `src/lib/legacy.ts`: the bridge (`onLegacyReady`) for React components that still talk to the old scripts

## To finish this batch tomorrow

1. Theme test: `qa/behave-theme.mjs` was just changed to compare end states with motion on (removed the `theming`
   flag, 3 s per transition). Run it original-vs-original first (`node behave-theme.mjs http://localhost:3000 http://localhost:3000`);
   it must say "Theme identical". Then original vs the export (:3002).
2. `npm run build`, start `npm run preview`, run the full suite against :3002 (one check at a time, nothing else running).
   Expected known differences only (qa/README.md). Also run behave-footer, behave-toast, behave-account, behave-theme.
3. If clean: merge `wip/shared-shell` into `main` (fast-forward), and update `momento-next/README.md` status and
   `PATCH-NOTES.md`.

## Then, in order (NEXTJS-HANDOFF.md, Phase 2 onwards)

- Dialogs as one piece: confirm, ask, choose, help, settings, create album, account chip + menu. They share `returnTo`
  (where focus goes back) and `cursorWas`, so they move together.
- Login / sign-up dialog, then the language system (`i18n.js`) as a React provider.
- Typed API layer (`src/lib/api.ts`), pages (Support, Settings, Social, My albums, Home), effects, one layout + clean URLs.

## Starting up

- Double-click `Open Momento Next preview.cmd` (dev site :3001 + original :3000), or by hand:
  `cd momento-next && npm run dev`, and `cd momento-next/qa/reference-site && node serve.mjs`.
- The export: `cd momento-next && npm run build && npm run preview` (:3002).
- From Git Bash, run the QA scripts with `export MSYS_NO_PATHCONV=1` first.

## Lessons from today (also in qa/README.md)

- Run one browser check at a time; parallel runs gave false failures (logout toast, theme).
- Always run a new test original-vs-original before trusting it.
- `emulateMediaFeatures` replaces the whole list: pass every setting each time.
