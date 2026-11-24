# qa: is the new site still identical to the old one?

Every change to this project is accepted only when the new site still looks and behaves like the original static site.
These scripts check that, using a real browser (Puppeteer) and a pixel diff (pixelmatch).

## One-time setup

```
cd qa
npm install
npx puppeteer browsers install chrome   # newer npm skips Puppeteer's own install script, so fetch Chrome yourself
                                        # (or set CHROME_PATH to a Chrome you already have)

# 1. A runnable copy of the ORIGINAL site. The download put " (1)" on every file name; this strips it.
node make-reference.mjs "<folder that holds the original index (1).html>"
#    -> qa/reference-site   (git-ignored; never edit it)

# 2. Serve both sites
cd reference-site && node serve.mjs       # original      http://localhost:3000
cd ../..          && npm run dev          # Next.js       http://localhost:3001   (or the export: npm run build && npm run preview  -> :3002)
```

**Running the checks from Git Bash?** Put `export MSYS_NO_PATHCONV=1` first. Otherwise Git Bash rewrites any argument that
looks like a path before Node sees it (`/albums.html` becomes `C:/Program Files/Git/albums.html`), and `compare.mjs` fails with
"Cannot navigate to invalid URL". PowerShell and cmd don't do this.

Keep the original on **:3000** (A) and the new site on **:3001** (B). Test the **production build** before calling anything
done: dev mode adds an overlay element and is slower.

## The checks

| Command (run inside `qa/`) | What it does |
| --- | --- |
| `node compare.mjs http://localhost:3000 http://localhost:3001 out/home /` | Full-page screenshots of both, desktop light, desktop dark and mobile, scrolled screen by screen, with a pixel diff for each. Prints `N px differ` per screen. Optional 5th argument is the path on the new site when it differs (`... out/404 /404.html /no/such/page`). |
| `node interact.mjs http://localhost:3000 http://localhost:3001 out/albums` | My albums click-through (31 steps: tabs, search, open an album, select mode, viewer, emoji picker, bin, activity, new album...). Screenshot **and page state** compared after every step. |
| `node interact-pages.mjs <A> <B> out/x settings` (or `support`, `events`) | The same for Settings, Support and Social. |
| `node behave-diff.mjs behave.mjs <A> <B>` (or `behave-albums.mjs`, `behave-pages.mjs`) | Behaviours as data: intro, nav, FAQ, auth dialog, deep links, redirects, translations, themes, metadata. Prints only what differs. |
| `node behave-static.mjs <A> <B> out/static` | Terms, Privacy and 404: every character of visible text, every element and attribute, the head, in 6 languages and both themes. |
| `node behave-404.mjs <A> <B> out/404` | The 404 page's hover, press and keyboard-focus states. |
| `node hyd.mjs` | Loads every page in 4 modes (sample data on or off, Spanish, Arabic) and fails on any React hydration error. Reads `NEXT_URL` (default `http://localhost:3001`). |

Screenshots and diff images are written to the folder you name (`out/...`, git-ignored). In a diff image, red is a differing pixel.

## Reading the results

- **Learn the noise floor first:** run a check with the original on both sides (`... http://localhost:3000 http://localhost:3000 ...`).
  A few hundred pixels on the first screen is normal (the live QR beam, a counter).
- **A test that fails the same way on both sites proves nothing.** If a step errors on both, fix the test.
- **Zero is the goal**, except for the harmless, known differences below.
- **Run one check at a time.** Two browser checks running together (or a build) slow the pages enough to give false
  differences: a page still opening when its screenshot is taken, a toast or theme fade caught half-way. Before you
  believe a difference, re-run that check alone, and run it original-vs-original too.

### Known, harmless differences
- First screen of Home and Albums: 0.03 to 0.3 % (live animation, lazy-loaded avatars).
- Social: the map. Tiles load from the network and the camera is a few frames apart, so screens with the map can differ a lot.
- A "City Marathon is happening near you" toast (the nearby-events check, about 2.5 s after load) can show in one run and not the other.
- Behaviour scripts: `manifest` link is `/manifest.webmanifest` (new) vs `manifest.webmanifest`; "home" is `/` (new) vs `/index.html`;
  the list of loaded `scripts` differs (the old inline blocks are files now); Settings' language popup is no longer the very last
  element in `<body>`; `<nextjs-portal>` and a hidden empty `<div>` are Next.js's own, dev only.
- The browser console shows `ERR_CONNECTION_REFUSED` when no backend runs on port 4000. The original does the same.
- The 404 page logs "status of 404" in the console: it really is served with a 404.
- `behave-albums.mjs`, step 7 (Social opened, then left after 1.5 s): the new site often logs `pageerror: Style is not done
  loading.` A race in the original map code (`lightUp()` in `events-1.js` runs on a `moveend` caused by the leaving fade,
  before the map style has loaded). The original rarely hits it; the port does, because the map script only loads after
  hydration. Present since the wrapper port (measured on commit 72107b4), not caused by later work. Nobody sees it (the page
  is already leaving). Fix it properly when the Social page is converted: wait for the style to load before lighting the map.
- `behave-theme.mjs` with motion on: the moment a View Transition is caught half-way varies run to run, so judge the theme
  on the reduced-motion runs (stable) and on end states.

## Adding a check for something you convert

Copy the closest script, and make it drive the thing you changed on both sites (same steps, same selectors), then compare screenshots
**and state** (open dialogs, `aria-*` values, input values, text of status lines). State catches what pixels can't.

## Loading speed and pop-ins

Three scripts for how the pages load (not comparisons with the original). Run them against the production build, served
the way GitHub Pages serves it: `npm run build && PORT=3012 npm run preview` (it sends GitHub's `cache-control:
max-age=600`, so pages reuse what earlier pages downloaded). They throttle to Fast 4G and a 4x slower CPU, and open Home
first, like someone arriving and moving around. They need Chrome: `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
(or the Windows path), and `PERF_URL` if the preview isn't on :3012.

- `perf.mjs [runs]`: per page, the median of first paint, largest paint, when the page scripts are ready, layout shifts
  (count and CLS) and when the last one happened, and on a first visit to Home when the intro started.
- `shifts.mjs /albums /events ...`: every layout shift on those pages, with the elements that moved (from → to).
- `frames.mjs /albums <folder> 900,1500,2500`: screenshots at those moments after the page started loading.
