# Where we stopped (22 Nov 2026)

Read this first, then `AUDIT-CHECKLIST.md` (what to check in the audit) and `NEXTJS-HANDOFF.md`.

## Agreed way of working
- Convert first; no end-to-end checks per change. Each change: type check, build, and a smoke load of every page
  (`node momento-next/qa/smoke.mjs http://localhost:3001`). The full old-vs-new checking happens together in the audit.
- Hosting: GitHub Pages. `npm run build` writes the static site to `momento-next/out/` (upload that folder).

## Done (all on `main`, one commit per step)
1. Shared pieces as React: header + nav, footer, toast, theme (ThemeProvider/useTheme), account (AccountProvider/
   useAccount), all dialogs (confirm, ask, choose, help, account settings, create album), account chip + menu, the
   login / sign-up dialog, the intro engine. The ~1,080-line shell copied into five pages is gone.
2. Typed API layer: `src/lib/api.ts` (types + every endpoint); the React code uses it.
3. Pages: Support's logic is React. Settings, Social, My albums and Home: their scripts moved out of the old loader into
   modules React starts (`src/page-scripts/`), code unchanged (chosen: "fast" approach).
4. Effects: one shared module for the inner pages (`src/components/effects/pageEffects.js`, with teardown);
   Support has no page script at all (`PageChrome`).
5. Clean URLs: /albums, /events, /settings, /support, /terms, /privacy (old .html addresses keep working).
6. Static export for GitHub Pages, with a local preview that behaves like it (`npm run preview`, :3002).

## Not done, and why
- **Language (i18n.js) as a React provider:** it translates everything the old page code builds, so it stays until the
  pages render their own text.
- **One layout + in-app navigation (next/link):** the page modules attach listeners nothing removes; swapping pages
  without a reload would stack them. Also needs the per-page CSS scoped first (see NEXTJS-HANDOFF Phase 1).
- **Idiomatic React for Settings, Social, My albums, Home:** they run their original code (moved, not rewritten).
- The shared asset scripts in `public/assets/` (extras, crop, inbox, pickers, nearby, qr, album-settings, event,
  join-here, event-albums: ~430 KB) are still classic scripts.

## Starting up
- Double-click `Open Momento Next preview.cmd` (dev site :3001 + original :3000), or `cd momento-next && npm run dev`.
- The export: `cd momento-next && npm run build && npm run preview` (:3002).
- From Git Bash, run the QA scripts with `export MSYS_NO_PATHCONV=1` first; run one browser check at a time.
