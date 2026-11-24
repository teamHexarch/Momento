// Which elements move while a page loads: every layout shift in the first 8 s, with the elements that moved.
//   CHROME_PATH=... PERF_URL=http://localhost:3012 node qa/shifts.mjs /albums /events
// Same throttling as qa/perf.mjs (Fast 4G, 4x CPU); Home is opened first so the intro has been seen.
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer';

const BASE = process.env.PERF_URL || 'http://localhost:3012';
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/albums', '/events'];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.emulateNetworkConditions(PredefinedNetworkConditions['Fast 4G']);
await page.emulateCPUThrottling(4);
await page.evaluateOnNewDocument(() => {
  const name = (n) => {
    if (!n || !n.nodeType) return '?';
    if (n.nodeType !== 1) return '#text in ' + name(n.parentElement);
    return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  };
  window.__shifts = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    if (e.hadRecentInput) return;
    window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), who: e.sources.map((s) => `${name(s.node)} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}${s.node && !s.node.isConnected ? " (removed)" : ""}`) });
  })).observe({ type: 'layout-shift', buffered: true });
});
await page.goto(BASE + '/?dev', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 6000));
for (const p of paths) {
  await page.goto(BASE + p, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 8000));
  const s = await page.evaluate(() => window.__shifts);
  console.log(`\n${p}`);
  for (const x of s) console.log(`  ${String(x.t).padStart(5)} ms  ${x.v}  ${x.who.join(' | ')}`);
}
await browser.close();
