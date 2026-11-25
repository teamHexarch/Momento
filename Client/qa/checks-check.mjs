// usage: node checks-check.mjs [base=http://localhost:3002] [shots-folder]
// The album's photo checks (your own photos waiting for our team or declined): with several, one line that opens
// into the list, so the photos keep their room. Then: after an upload the bar and the note fade after 5 seconds.
// Dev preview has no checks, so the album answer gets 1 waiting and 2 declined ones added (the server's shape).
// At phone, tablet and desktop sizes. CHROME_PATH: a Chrome to use instead of Puppeteer's own.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3002';
const shotsDir = process.argv[3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
const out = {}, errors = [];
const SIZES = [
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['tablet', { width: 820, height: 1180, isMobile: true, hasTouch: true }],
  ['desktop', { width: 1440, height: 900, isMobile: false, hasTouch: false }],
];
for (const [name, vp] of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ ...vp, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  const shot = async (n) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/checks-${name}-${n}.png` }); };
  await page.goto(base + '/albums?dev=reset', { waitUntil: 'networkidle2' });
  await wait(2500);
  if (process.env.DARK) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.evaluate(() => {
    window.__checks = [
      { id: 'c1', name: 'IMG_5080.jpeg', state: 'review' },
      { id: 'c2', name: 'IMG_4941.jpeg', state: 'rejected', explicit: true },
      { id: 'c3', name: 'IMG_4940.jpeg', state: 'rejected', explicit: true },
    ];
    const api = window.momentoApi;
    window.momentoApi = async (path, opts = {}) => {
      const m = /^\/api\/albums\/([^/]+)\/checks\/([^/]+)$/.exec(path);
      if (m && opts.method === 'DELETE') { window.__checks = window.__checks.filter((c) => c.id !== m[2]); return { ok: true }; }
      if (/^\/api\/albums\/[^/]+\/checks$/.test(path)) return { checks: window.__checks };
      const r = await api(path, opts);
      if (/^\/api\/albums\/[^/]+$/.test(path) && (opts.method || 'GET') === 'GET') return { ...r, checks: window.__checks };
      return r;
    };
  });
  await page.evaluate(() => document.querySelector('#years .album-hit').click());
  await wait(2000);
  const state = () => page.evaluate(() => {
    const box = document.getElementById('albumChecks'), sum = document.getElementById('albumChecksSum'), list = document.getElementById('albumCheckList');
    const grid = document.querySelector('.album-scroll').getBoundingClientRect(), tiles = [...document.querySelectorAll('#thumbs > *')].map((t) => t.getBoundingClientRect());
    const fullRows = new Set(tiles.filter((t) => t.top >= grid.top - 1 && t.bottom <= grid.bottom + 1).map((t) => Math.round(t.top))).size;
    return { shown: !box.hidden, sum: getComputedStyle(sum).display === 'none' ? null : sum.textContent, expanded: sum.getAttribute('aria-expanded'), rows: list.hidden ? 0 : list.children.length,
      height: Math.round(box.getBoundingClientRect().height), photosArea: Math.round(grid.height), fullPhotoRows: fullRows, hScroll: document.documentElement.scrollWidth > innerWidth };
  });
  out[name] = { closed: await state() };
  await shot('1-closed');
  await page.click('#albumChecksSum'); await wait(500);
  out[name].open = await state();
  await shot('2-open');
  // remove one declined photo: two left, still one line
  await page.click('#albumCheckList .check-x'); await wait(900);
  out[name].afterRemove = await state();
  await page.click('#albumChecksSum'); await wait(400);
  out[name].closedAgain = await state();
  // down to one: just its row
  await page.evaluate(() => { window.__checks = window.__checks.slice(0, 1); });
  await page.evaluate(() => document.querySelector('#albumModal [data-close]').click()); await wait(1200);
  await page.evaluate(() => document.querySelector('#years .album-hit').click()); await wait(2000);
  out[name].single = await state();
  await shot('3-single');

  if (name === 'phone') {
    // an upload: the bar and note are there at 4 seconds and gone by 6
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').fillRect(0, 0, 64, 64);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
      const input = document.getElementById('albumFiles'), dt = new DataTransfer();
      dt.items.add(new File([b], 'up.jpg', { type: 'image/jpeg' }));
      input.files = dt.files; input.dispatchEvent(new Event('change'));
    });
    await wait(800);
    await page.evaluate(() => document.querySelector('.ev-ask [data-yes]').click());
    const bar = () => page.evaluate(() => ({ bar: !document.getElementById('upload').hidden, label: document.getElementById('uploadLabel').textContent, note: document.getElementById('albumNote').textContent }));
    // wait for it to finish
    for (let i = 0; i < 40 && !/uploaded|received|waiting|Nothing/i.test((await bar()).label); i++) await wait(250);
    const t0 = Date.now();
    out.upload = { done: await bar() };
    await wait(4000);
    out.upload.at4s = { ...(await bar()), t: Date.now() - t0 };
    await wait(2000);
    out.upload.at6s = { ...(await bar()), t: Date.now() - t0 };
  }
  await page.close();
}
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
