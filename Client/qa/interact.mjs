// usage: node interact.mjs <A> <B> <outDir> [path=/albums.html]
// Runs the same click-through on both sites, screenshots every state, pixel-diffs the pairs, and prints
// the page's observable state after each step so behaviour can be compared as well as looks.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , A, B, OUT, PAGE = '/albums.html'] = process.argv;
const CHROME = process.env.CHROME_PATH || undefined;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => ({
  tab: document.querySelector('.tab[aria-selected="true"]')?.dataset.filter,
  albums: document.querySelectorAll('#years .album').length,
  likedShown: !document.getElementById('likedView')?.hidden,
  emptyShown: !document.getElementById('empty')?.hidden,
  albumOpen: document.getElementById('albumModal')?.open,
  albumTitle: document.getElementById('albumTitle')?.textContent,
  thumbs: document.getElementById('thumbs')?.children.length,
  selecting: !document.getElementById('abSelHead')?.hidden,
  selCount: document.getElementById('abCount')?.textContent,
  viewerOpen: document.getElementById('viewer')?.open,
  viewerCount: document.getElementById('vwCount')?.textContent,
  binOpen: document.getElementById('binModal')?.open,
  activityOpen: document.getElementById('activityModal')?.open,
  dialogsOpen: [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className),
  menuOpen: document.getElementById('abMenu') && !document.getElementById('abMenu').hidden,
  hash: location.hash, search: location.search,
});

const clearSearch = (p) => p.$eval('#search', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });

const STEPS = [
  ['01-start', async () => {}],
  ['02-tab-host', async (p) => { await p.click('.tab[data-filter="host"]'); await sleep(700); }],
  ['03-tab-guest', async (p) => { await p.click('.tab[data-filter="guest"]'); await sleep(700); }],
  ['04-tab-group', async (p) => { await p.click('.tab[data-filter="group"]'); await sleep(700); }],
  ['05-tab-liked', async (p) => { await p.click('.tab[data-filter="liked"]'); await sleep(900); }],
  ['06-tab-all', async (p) => { await p.click('.tab[data-filter="all"]'); await sleep(700); }],
  ['07-search-none', async (p) => { await clearSearch(p); await p.type('#search', 'zzzz'); await sleep(700); }],
  ['08-search-maya', async (p) => { await clearSearch(p); await p.type('#search', 'maya'); await sleep(700); }],
  ['09-search-cleared', async (p) => { await clearSearch(p); await sleep(700); }],
  ['10-album-open', async (p) => { await p.waitForSelector('#years .album-hit', { timeout: 4000 }); await p.evaluate(() => document.querySelector('#years .album-hit').click()); await sleep(1800); }],
  ['11-album-menu', async (p) => { await p.click('#abMore'); await sleep(600); }],
  ['12-album-menu-closed', async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => { const m = document.getElementById('abMenu'); if (m && !m.hidden) document.getElementById('abMore').click(); }); await sleep(500); }],
  ['13-album-select', async (p) => { await p.click('#abSelect'); await sleep(700); }],
  ['14-album-select-two', async (p) => { const t = await p.$$('#thumbs > *'); await t[0].click(); await t[1].click(); await sleep(600); }],
  ['15-album-select-all', async (p) => { await p.click('#abAll'); await sleep(600); }],
  ['16-album-select-cancel', async (p) => { await p.click('#abCancel'); await sleep(600); }],
  ['17-viewer', async (p) => { const t = await p.$$('#thumbs > *'); await t[2].click(); await sleep(1500); }],
  ['18-viewer-next', async (p) => { await p.keyboard.press('ArrowRight'); await sleep(900); }],
  ['19-viewer-react', async (p) => { await p.click('#vwReact'); await sleep(900); }],
  ['20-viewer-react-closed', async (p) => { await p.keyboard.press('Escape'); await sleep(500); }],
  ['21-viewer-closed', async (p) => { await p.evaluate(() => document.getElementById('vwClose').click()); await sleep(900); }],
  ['22-album-closed', async (p) => { await p.evaluate(() => document.querySelector('#albumModal [data-close]').click()); await sleep(900); }],
  ['23-bin', async (p) => { await p.click('#binOpen'); await sleep(1200); }],
  ['24-bin-hidden-tab', async (p) => { await p.click('#binTabHidden'); await sleep(700); }],
  ['25-bin-closed', async (p) => { await p.evaluate(() => document.querySelector('#binModal [data-close]').click()); await sleep(800); }],
  ['26-activity', async (p) => { await p.click('#activityOpen'); await sleep(1200); }],
  ['27-activity-closed', async (p) => { await p.evaluate(() => document.querySelector('#activityModal [data-close]').click()); await sleep(800); }],
  ['28-new-album', async (p) => { await p.click('[data-create]'); await sleep(1400); }],
  ['29-new-album-closed', async (p) => { await p.keyboard.press('Escape'); await sleep(900); }],
  ['30-account-menu', async (p) => { await p.evaluate(() => document.querySelector('.me-slot button, [data-acct-host] button')?.click()); await sleep(900); }],
  ['31-nav-caret', async (p) => { await p.keyboard.press('Escape'); await sleep(300); await p.click('.nav-caret'); await sleep(700); }],
];

async function run(base, cfg) {
  const page = await browser.newPage();
  await page.setViewport({ width: cfg.w, height: cfg.h, deviceScaleFactor: 1, isMobile: cfg.mobile, hasTouch: cfg.mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: cfg.scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
  await page.goto(base + PAGE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2500);
  const out = [];
  for (const [name, fn] of STEPS) {
    let err = null;
    try { await fn(page); } catch (e) { err = e.message.slice(0, 100); }
    const file = path.join(OUT, `${cfg.name}-${name}-${base.endsWith('3000') ? 'A' : 'B'}.png`);
    await page.screenshot({ path: file });
    out.push({ name, file, state: await page.evaluate(STATE), err });
  }
  await page.close();
  return { out, errors };
}

const configs = [
  { name: 'desk', w: 1440, h: 900, scheme: 'light', mobile: false },
  { name: 'mob', w: 390, h: 844, scheme: 'dark', mobile: true },
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let worst = 0, stateDiffs = 0;
for (const cfg of configs) {
  const a = await run(A, cfg), b = await run(B, cfg);
  console.log(`\n=== ${cfg.name} (${cfg.w}x${cfg.h}) console errors  A: ${JSON.stringify([...new Set(a.errors)])}   B: ${JSON.stringify([...new Set(b.errors)])}`);
  for (let i = 0; i < a.out.length; i++) {
    const x = a.out[i], y = b.out[i];
    const pa = PNG.sync.read(fs.readFileSync(x.file)), pb = PNG.sync.read(fs.readFileSync(y.file));
    const diff = new PNG({ width: pa.width, height: pa.height });
    const px = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
    fs.writeFileSync(path.join(OUT, `${cfg.name}-${x.name}-diff.png`), PNG.sync.write(diff));
    const same = JSON.stringify(x.state) === JSON.stringify(y.state);
    if (!same) stateDiffs++;
    const pct = 100 * px / (pa.width * pa.height); worst = Math.max(worst, pct);
    console.log(`${x.name.padEnd(24)} ${String(px).padStart(7)} px (${pct.toFixed(3)}%)  state ${same ? 'same' : 'DIFFERENT'}${x.err || y.err ? `  stepErr A:${x.err} B:${y.err}` : ''}`);
    if (!same) console.log('   A', JSON.stringify(x.state), '\n   B', JSON.stringify(y.state));
  }
}
console.log(`\nworst step: ${worst.toFixed(3)}%   steps with different page state: ${stateDiffs}`);
await browser.close();
