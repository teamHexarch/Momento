// usage: node feature-check.mjs [base=http://localhost:3001]
// Exercises the new features (not a comparison with the original): the album window's sort and filter, the viewer's
// zoom, and the camera's tools (with Chrome's fake camera). Prints what it saw and any page errors.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(base, ['camera']);
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const out = {};
await page.goto(base + '/albums?dev=reset#album=a1', { waitUntil: 'networkidle2' });
await wait(3500);

// ---- sort and filter ----
const grid = () => page.evaluate(() => ({
  tools: !document.getElementById('abTools').hidden,
  first: [...document.querySelectorAll('#thumbs .ab-tile')].slice(0, 3).map((t) => t.dataset.id).join(','),
  shown: [...document.querySelectorAll('#thumbs .ab-tile')].filter((t) => !t.hidden).length,
  total: document.querySelectorAll('#thumbs .ab-tile').length,
  label: document.getElementById('abSortLabel').textContent,
  note: document.getElementById('abShown').hidden ? '' : document.querySelector('#abShown span').textContent,
}));
out.open = await grid();
await page.click('#abSortBtn'); await wait(200);
out.sortOptions = await page.evaluate(() => [...document.querySelectorAll('#abSortMenu [data-sort]')].map((b) => b.dataset.sort).join(','));
await page.click('#abSortMenu [data-sort="oldest"]'); await wait(500);
out.oldest = await grid();
await page.click('#abSortBtn'); await wait(200); await page.click('#abSortMenu [data-sort="size"]'); await wait(500);
out.size = await grid();
await page.click('#abFilters [data-filter="mine"]'); await wait(300);
out.mine = await grid();
await page.click('#abShownClear'); await wait(300);
out.cleared = await grid();
await page.click('#abWhoBtn'); await wait(200);
out.whoOptions = await page.evaluate(() => [...document.querySelectorAll('#abWhoMenu .ab-item')].map((x) => x.textContent).join(', '));
await page.click('#abWhoMenu .ab-item:nth-child(3)'); await wait(300);
out.who = { label: await page.evaluate(() => document.getElementById('abWhoLabel').textContent), set: await page.evaluate(() => document.getElementById('abWhoBtn').classList.contains('is-set')), ...(await grid()) };
await page.click('#abWhoBtn'); await wait(200); await page.click('#abWhoMenu .ab-item:nth-child(1)'); await wait(300);
out.whoCleared = await grid();

// ---- the viewer's zoom ----
await page.click('#abSortBtn'); await wait(200); await page.click('#abSortMenu [data-sort="newest"]'); await wait(400);
await page.evaluate(() => document.querySelector('#thumbs .ab-tile:not([hidden])').click());
await wait(1500);
const zoom = () => page.evaluate(() => ({ zoomed: document.getElementById('viewer').classList.contains('is-zoomed'), label: document.getElementById('vwZoomFit').textContent, w: Math.round(document.getElementById('vwImg').getBoundingClientRect().width) }));
out.viewer = await zoom();
await page.click('#vwZoomIn'); await wait(500); out.zoomIn = await zoom();
await page.click('#vwZoomIn'); await wait(500); out.zoomIn2 = await zoom();
await page.click('#vwZoomOut'); await wait(500); out.zoomOut = await zoom();
await page.keyboard.press('0'); await wait(400); out.fit = await zoom();
await page.keyboard.press('Escape'); await wait(800);

// ---- the camera ----
await page.evaluate(() => { window.__cam = Momento.event.camera(); });
await wait(2500);
const cam = () => page.evaluate(() => {
  const d = document.querySelector('.ev-cam');
  return d && {
    status: d.querySelector('.ev-cam-top p').textContent,
    chips: [...d.querySelectorAll('.ev-zchip')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' '),
    zoomShown: !d.querySelector('.ev-zoom').hidden, range: d.querySelector('.ev-zoom-range').value,
    video: d.querySelector('video').style.transform, timer: d.querySelector('[data-timer]').getAttribute('aria-label'),
    grid: d.classList.contains('has-grid'), torch: !d.querySelector('[data-torch]').hidden, shots: d.querySelectorAll('.ev-shots img').length,
    use: d.querySelector('[data-use]').hidden ? '' : d.querySelector('[data-use]').textContent,
  };
});
out.camera = await cam();
await page.click('.ev-zchip[data-z="2"]'); await wait(300); out.cam2x = await cam();
await page.click('[data-grid]'); await page.click('[data-timer]'); await wait(200); out.camTools = await cam();
await page.click('[data-timer]'); await page.click('[data-timer]'); await wait(100);   // back to off
await page.click('.ev-shutter'); await wait(1200); out.camShot = await cam();
await page.click('[data-grid]');
await page.click('[data-use]'); await wait(500);
out.cameraResolved = await page.evaluate(async () => (await window.__cam).map((f) => `${f.type} ${f.size > 1000}`).join(','));

out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
