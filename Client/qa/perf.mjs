// How fast each page becomes ready, and how much it jumps around while it loads.
//
//   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node qa/perf.mjs [runs]
//
// Serves nothing itself: start the production preview first (npm run build && PORT=3012 npm run preview) and point
// PERF_URL at it (default http://localhost:3012). Network and CPU are throttled (Fast 4G, 4x slower CPU). Each run is
// a fresh browser profile that opens Home once (so caches are warm and the intro has been seen, like someone moving
// around the site), then opens every page in turn. The table shows the median of all runs, in milliseconds after the
// page started loading:
//   fcp      first paint with content
//   lcp      largest content painted
//   ready    the page scripts have all run (Momento's "legacy ready")
//   shifts   layout shifts in the first 8 s, and their total score (CLS)
//   last     when the last layout shift happened
//   intro    (cold Home only) when the intro's first animation started
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer';

const BASE = process.env.PERF_URL || 'http://localhost:3012';
const RUNS = +process.argv[2] || 5;
const PAGES = ['/', '/albums', '/events', '/settings', '/support'];
const WATCH = 8000;

const probe = () => {
  const m = (window.__perf = { shifts: 0, cls: 0, last: 0, lcp: 0, fcp: 0, ready: 0, intro: 0 });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    if (e.hadRecentInput) return;
    m.shifts++; m.cls += e.value; m.last = Math.round(e.startTime);
  })).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { m.lcp = Math.round(e.startTime); })).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') m.fcp = Math.round(e.startTime); })).observe({ type: 'paint', buffered: true });
  addEventListener('momento:legacy-ready', () => { m.ready = Math.round(performance.now()); });
  const tick = () => {
    if (!m.intro) {
      const v = document.getElementById('intro');
      if (v && v.getAnimations({ subtree: true }).length) m.intro = Math.round(performance.now());
    }
    if (performance.now() < 12000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const rows = {};
const add = (key, m) => { (rows[key] ||= []).push(m); };

async function open(page, path) {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, WATCH));
  return page.evaluate(() => window.__perf);
}

for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateNetworkConditions(PredefinedNetworkConditions['Fast 4G']);
  await page.emulateCPUThrottling(4);
  await page.evaluateOnNewDocument(probe);
  add('/ (cold, intro)', await open(page, '/?dev'));
  for (const p of PAGES) add(p, await open(page, p));
  await ctx.close();
  process.stdout.write(`run ${run + 1}/${RUNS} done\n`);
}
await browser.close();

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log('\npage'.padEnd(20), 'fcp'.padStart(6), 'lcp'.padStart(6), 'ready'.padStart(6), 'shifts'.padStart(7), 'cls'.padStart(7), 'last'.padStart(6), 'intro'.padStart(6));
for (const [k, ms] of Object.entries(rows)) {
  const g = (f) => med(ms.map((m) => m[f]));
  console.log(k.padEnd(19), String(g('fcp')).padStart(6), String(g('lcp')).padStart(6), String(g('ready')).padStart(6),
    String(g('shifts')).padStart(7), g('cls').toFixed(3).padStart(7), String(g('last')).padStart(6), String(g('intro') || '-').padStart(6));
}
