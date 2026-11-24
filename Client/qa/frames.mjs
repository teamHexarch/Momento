// Screenshots of one page at set moments while it loads (same throttling as qa/perf.mjs), to see what pops in.
//   CHROME_PATH=... PERF_URL=http://localhost:3012 node qa/frames.mjs /albums out-dir 900,1500,2500,4000
import fs from 'node:fs';
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer';

const BASE = process.env.PERF_URL || 'http://localhost:3012';
const [path = '/albums', dir = 'frames', at = '900,1500,2500,4000'] = process.argv.slice(2);
const times = at.split(',').map(Number);
fs.mkdirSync(dir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.emulateNetworkConditions(PredefinedNetworkConditions['Fast 4G']);
await page.emulateCPUThrottling(4);
await page.goto(BASE + '/?dev', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 6000));
const t0 = Date.now();
const nav = page.goto(BASE + path, { waitUntil: 'load' });
for (const t of times) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const file = `${dir}/${path.replace(/\W+/g, '_') || 'home'}-${t}.png`;
  await page.screenshot({ path: file }).catch((e) => console.log('skip', t, e.message));
  console.log(file);
}
await nav;
await browser.close();
