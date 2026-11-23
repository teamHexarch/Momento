// usage: node compare.mjs <urlA> <urlB> <outDir> [path=/]
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , A, B, OUT, PAGE = '/', PAGE_B = PAGE] = process.argv;
const CHROME = process.env.CHROME_PATH || undefined;
fs.mkdirSync(OUT, { recursive: true });

const configs = [
  { name: 'desk-light', w: 1440, h: 900, scheme: 'light', mobile: false },
  { name: 'desk-dark', w: 1440, h: 900, scheme: 'dark', mobile: false },
  { name: 'mob-light', w: 390, h: 844, scheme: 'light', mobile: true },
];

async function shoot(browser, base, cfg, tag) {
  const page = await browser.newPage();
  await page.setViewport({ width: cfg.w, height: cfg.h, deviceScaleFactor: 1, isMobile: cfg.mobile, hasTouch: cfg.mobile });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: cfg.scheme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(base + (tag === 'B' ? PAGE_B : PAGE), { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2500));
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const files = [];
  let i = 0;
  for (let y = 0; y < total; y += cfg.h) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 900));
    const f = path.join(OUT, `${cfg.name}-${tag}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    i++;
  }
  await page.close();
  return { files, total, errors };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const summary = [];
for (const cfg of configs) {
  const a = await shoot(browser, A, cfg, 'A');
  const b = await shoot(browser, B, cfg, 'B');
  console.log(`\n== ${cfg.name}: heights A=${a.total} B=${b.total}`);
  if (a.errors.length) console.log(' A console:', [...new Set(a.errors)].slice(0, 6));
  if (b.errors.length) console.log(' B console:', [...new Set(b.errors)].slice(0, 6));
  const n = Math.min(a.files.length, b.files.length);
  for (let i = 0; i < n; i++) {
    const pa = PNG.sync.read(fs.readFileSync(a.files[i])), pb = PNG.sync.read(fs.readFileSync(b.files[i]));
    if (pa.width !== pb.width || pa.height !== pb.height) { console.log(` shot ${i}: size differs`); continue; }
    const diff = new PNG({ width: pa.width, height: pa.height });
    const px = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
    fs.writeFileSync(path.join(OUT, `${cfg.name}-diff-${String(i).padStart(2, '0')}.png`), PNG.sync.write(diff));
    console.log(` shot ${i}: ${px} px differ (${(100 * px / (pa.width * pa.height)).toFixed(3)}%)`);
  }
}
await browser.close();
