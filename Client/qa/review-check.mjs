// usage: node review-check.mjs [base=http://localhost:3002] [shots-folder]
// The camera's review screen (open the last photo, swipe, crop with a shape and by dragging a corner, delete) and the
// upload confirmation's crosses (leave photos out). Phone-sized, with touch and Chrome's fake camera.
// Then: closing the camera with photos asks first; "Back to camera" in the confirmation reopens the camera with the
// photos kept (also through the album's own camera button); and the confirmation and review screen at phone, tablet
// (portrait and landscape) and desktop sizes. CHROME_PATH: a Chrome to use instead of Puppeteer's own.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3002';
const shotsDir = process.argv[3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await browser.defaultBrowserContext().overridePermissions(base, ['camera']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` }); };
const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const out = {};

await page.goto(base + '/albums?dev=reset', { waitUntil: 'networkidle2' });
await wait(3000);
await page.evaluate(() => { window.__cam = Momento.event.camera(); });
await wait(2500);
for (let i = 0; i < 3; i++) { await page.tap('.ev-shutter'); await wait(900); }
out.taken = await page.evaluate(() => ({ thumb: !document.querySelector('.ev-shots').hidden, label: document.querySelector('.ev-shots').getAttribute('aria-label') }));

// open the last photo
await page.tap('.ev-shots'); await wait(500);
const state = () => page.evaluate(() => ({
  open: !document.querySelector('.ev-rev').hidden, count: document.querySelector('.ev-rev-count').textContent,
  strip: document.querySelectorAll('.ev-rev-strip button').length, current: document.querySelector('.ev-rev-stage > img').alt,
}));
out.review = await state();
await shot('rev-1-open');
// swipe right: the previous photo
const [sx, sy] = await center('.ev-rev-stage');
await page.touchscreen.touchStart(sx + 100, sy); await page.touchscreen.touchMove(sx - 20, sy); await page.touchscreen.touchMove(sx - 100, sy); await page.touchscreen.touchEnd();
await wait(300);
out.afterSwipeLeft = (await state()).current;
await page.tap('.ev-rev-strip button:nth-child(1)'); await wait(300);
out.afterStripTap = (await state()).current;

// crop: square, then drag the bottom right corner in
await page.tap('[data-rev-crop]'); await wait(500);
await shot('rev-2-crop');
const size = () => page.evaluate(() => { const i = document.querySelector('.ev-rev-stage > img'); return `${i.naturalWidth}x${i.naturalHeight}`; });
out.before = await size();
await page.tap('[data-shape="1:1"]'); await wait(300);
const [cx, cy] = await center('.ev-crop [data-h="se"]');
await page.touchscreen.touchStart(cx, cy); for (let k = 1; k <= 6; k++) { await page.touchscreen.touchMove(cx - k * 10, cy - k * 10); await wait(16); } await page.touchscreen.touchEnd();
await wait(200);
await shot('rev-3-square');
await page.tap('[data-crop-done]'); await wait(900);
out.cropped = await size();
// crop again, then back to the original
await page.tap('[data-rev-crop]'); await wait(400);
out.resetShown = await page.evaluate(() => !document.querySelector('[data-crop-reset]').hidden);
await page.tap('[data-crop-reset]'); await wait(600);
out.reset = await size();
await page.tap('[data-crop-cancel]'); await wait(300);
// crop it square once more, to keep
await page.tap('[data-rev-crop]'); await wait(400); await page.tap('[data-shape="1:1"]'); await wait(200); await page.tap('[data-crop-done]'); await wait(900);
out.kept = await size();

// delete the second photo (answer the question)
await page.tap('.ev-rev-strip button:nth-child(2)'); await wait(300);
await page.tap('[data-rev-del]'); await wait(700);
await shot('rev-4-delete');
out.askedFirst = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].some((d) => /Delete this photo/.test(d.textContent)));
await page.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === 'Delete'); b?.click(); });
await wait(700);
out.afterDelete = await state();
// back to the camera, then use the photos
await page.tap('[data-rev-back]'); await wait(400);
out.back = await page.evaluate(() => ({ reviewOpen: !document.querySelector('.ev-rev').hidden, use: document.querySelector('[data-use]').getAttribute('aria-label') }));
await page.tap('[data-use]'); await wait(600);
out.used = await page.evaluate(async () => (await window.__cam).map((f) => f.name.replace(/\d+/, '#') + ' ' + f.size));
out.usedSizes = await page.evaluate(async () => Promise.all((await window.__cam).map(async (f) => { const b = await createImageBitmap(f); return `${b.width}x${b.height}`; })));

// the upload confirmation: four photos, leave one out
const files = await page.evaluate(async () => {
  const make = async (n) => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').fillStyle = ['#c55', '#5c5', '#55c', '#cc5'][n]; c.getContext('2d').fillRect(0, 0, 64, 64); const b = await new Promise((r) => c.toBlob(r, 'image/jpeg')); return new File([b], `p${n}.jpg`, { type: 'image/jpeg' }); };
  window.__files = await Promise.all([0, 1, 2, 3].map(make));
  window.__ask = Momento.event.confirmUpload({ name: 'Test album' }, window.__files);
  return window.__files.length;
});
await wait(600);
const ask = () => page.evaluate(() => ({ title: document.querySelector('#evAskTitle').textContent, tiles: document.querySelectorAll('.ev-thumb').length, button: document.querySelector('[data-yes]').textContent, disabled: document.querySelector('[data-yes]').disabled }));
out.ask = await ask();
await shot('ask-1');
await page.tap('.ev-thumb:nth-child(2) .ev-thumb-x'); await wait(300);
out.askAfterOne = await ask();
await shot('ask-2');
await page.tap('[data-yes]'); await wait(300);
out.uploaded = await page.evaluate(async () => (await window.__ask).files.map((f) => f.name).join(','));
// leaving every photo out turns Upload off
await page.evaluate(() => { window.__ask2 = Momento.event.confirmUpload({ name: 'Test album' }, window.__files.slice(0, 2)); });
await wait(500);
await page.tap('.ev-thumb-x'); await wait(200); await page.tap('.ev-thumb-x'); await wait(300);
out.askEmpty = await ask();
await shot('ask-3-empty');
await page.tap('[data-no]'); await wait(300);
out.cancelled = await page.evaluate(async () => await window.__ask2);

// ---- closing the camera with photos taken asks first ----
const answer = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === l); b?.click(); return !!b; }, label);
const asking = (re) => page.evaluate((r) => [...document.querySelectorAll('dialog[open]')].some((d) => new RegExp(r).test(d.textContent)), re);
await page.evaluate(() => { window.__cam2 = Momento.event.camera(); });
await wait(2500);
for (let i = 0; i < 2; i++) { await page.tap('.ev-shutter'); await wait(900); }
await page.tap('.ev-cam-x'); await wait(700);
out.closeAsks = await asking('Discard 2 photos');
await shot('cam-1-discard');
await answer('Cancel'); await wait(500);
out.closeKept = await page.evaluate(() => ({ open: !!document.querySelector('.ev-cam'), use: document.querySelector('[data-use]')?.getAttribute('aria-label') }));
await page.keyboard.press('Escape'); await wait(700);
out.escAsks = await asking('Discard 2 photos');
await answer('Discard'); await wait(600);
out.discarded = await page.evaluate(async () => ({ files: (await window.__cam2).length, open: !!document.querySelector('.ev-cam') }));
// no photos: closes straight away
await page.evaluate(() => { window.__cam3 = Momento.event.camera(); });
await wait(1500);
await page.tap('.ev-cam-x'); await wait(500);
out.emptyClose = await page.evaluate(async () => ({ files: (await window.__cam3).length, open: !!document.querySelector('.ev-cam') }));

// ---- "Back to camera" keeps the photos ----
await page.evaluate(() => { window.__ask3 = Momento.event.confirmUpload({ name: 'Test album' }, window.__files.slice(0, 3), { fromCamera: true }); });
await wait(500);
out.backLabel = await page.evaluate(() => document.querySelector('[data-no]').textContent);
await page.tap('.ev-thumb-x'); await wait(300);
await page.tap('[data-no]'); await wait(300);
out.back = await page.evaluate(async () => { const r = await window.__ask3; return { cancelled: r.cancelled, files: r.files.map((f) => f.name).join(',') }; });
await page.evaluate(async () => { window.__cam4 = Momento.event.camera((await window.__ask3).files); });
await wait(1500);
out.reopened = await page.evaluate(() => ({ thumb: !document.querySelector('.ev-shots').hidden, use: document.querySelector('[data-use]').getAttribute('aria-label') }));
await page.tap('[data-use]'); await wait(500);
out.reopenedUsed = await page.evaluate(async () => (await window.__cam4).map((f) => f.name).join(','));

// ---- the same through the album's camera button (sample album, dev mode) ----
await page.evaluate(() => document.querySelector('#years .album-hit')?.click());
await wait(1800);
const before = await page.evaluate(() => document.querySelectorAll('#thumbs > *').length);
await page.evaluate(() => document.getElementById('albumCamera')?.click());
await wait(2500);
out.albumCamera = await page.evaluate(() => !!document.querySelector('.ev-cam'));
if (out.albumCamera) {
  for (let i = 0; i < 2; i++) { await page.tap('.ev-shutter'); await wait(900); }
  await page.tap('[data-use]'); await wait(800);
  out.albumAsk = await ask();
  await page.tap('[data-no]'); await wait(2500);
  out.albumBack = await page.evaluate(() => ({ open: !!document.querySelector('.ev-cam'), use: document.querySelector('[data-use]')?.getAttribute('aria-label') }));
  await page.tap('[data-use]'); await wait(800);
  await page.tap('.ev-thumb-x'); await wait(300);
  out.albumAskAfterX = await ask();
  await page.tap('[data-yes]'); await wait(5000);
  out.albumAfterUpload = { before, after: await page.evaluate(() => document.querySelectorAll('#thumbs > *').length), note: await page.evaluate(() => document.getElementById('albumNote')?.textContent), label: await page.evaluate(() => document.getElementById('uploadLabel')?.textContent) };
  await shot('album-after-upload');
}

// ---- sizes: phone, tablet portrait and landscape, desktop ----
const SIZES = [
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['tablet', { width: 820, height: 1180, isMobile: true, hasTouch: true }],
  ['tablet-land', { width: 1180, height: 820, isMobile: true, hasTouch: true }],
  ['desktop', { width: 1440, height: 900, isMobile: false, hasTouch: false }],
];
out.sizes = {};
for (const [name, vp] of SIZES) {
  const p = await browser.newPage();
  await p.setViewport({ ...vp, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  await p.goto(base + '/albums', { waitUntil: 'networkidle2' });
  await wait(2500);
  await p.evaluate(async () => {
    const make = async (n) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = `hsl(${n * 37} 60% 55%)`; g.fillRect(0, 0, 400, 300); const b = await new Promise((r) => c.toBlob(r, 'image/jpeg')); return new File([b], `s${n}.jpg`, { type: 'image/jpeg' }); };
    window.__f = await Promise.all(Array.from({ length: 9 }, (_, n) => make(n)));
    window.__a = Momento.event.confirmUpload({ name: 'Test album' }, window.__f, { fromCamera: true });
  });
  await wait(700);
  const m = await p.evaluate(() => {
    const d = document.querySelector('.ev-ask'), r = d.getBoundingClientRect();
    const tiles = [...d.querySelectorAll('.ev-thumb')].map((t) => t.getBoundingClientRect());
    const xs = [...d.querySelectorAll('.ev-thumb-x')].map((x, i) => { const b = x.getBoundingClientRect(), t = tiles[i]; return { inside: b.left >= t.left && b.right <= t.right && b.top >= t.top && b.bottom <= t.bottom, w: Math.round(b.width), tap: Math.round(b.width + 12) }; });
    return { dialog: `${Math.round(r.width)}x${Math.round(r.height)}`, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, tile: Math.round(tiles[0].width), perRow: tiles.filter((t) => t.top === tiles[0].top).length,
      xInside: xs.every((x) => x.inside), xSize: xs[0].w, xTap: xs[0].tap, hScroll: document.documentElement.scrollWidth > innerWidth };
  });
  if (shotsDir) await p.screenshot({ path: `${shotsDir}/size-${name}-ask.png` });
  await p.evaluate(() => document.querySelector('[data-no]').click());
  await wait(300);
  // the review screen with the photos taken
  await p.evaluate(async () => { window.__c = Momento.event.camera((await window.__a).files.slice(0, 5)); });
  await wait(1800);
  await p.evaluate(() => document.querySelector('.ev-shots').click());
  await wait(600);
  m.review = await p.evaluate(() => {
    const img = document.querySelector('.ev-rev-stage > img').getBoundingClientRect(), strip = document.querySelector('.ev-rev-strip').getBoundingClientRect();
    const top = document.querySelector('.ev-rev-top').getBoundingClientRect(), bottom = document.querySelector('.ev-rev-bottom').getBoundingClientRect();
    return { photo: `${Math.round(img.width)}x${Math.round(img.height)}`, clear: img.top >= top.bottom - 1 && img.bottom <= bottom.top + 1, stripOneRow: strip.height < 70, fits: bottom.bottom <= innerHeight };
  });
  if (!vp.hasTouch) {
    await p.keyboard.press('ArrowLeft'); await wait(200);
    m.review.arrow = await p.evaluate(() => document.querySelector('.ev-rev-count').textContent);
    await p.keyboard.press('Delete'); await wait(600);
    m.review.deleteAsks = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].some((d) => /Delete this photo/.test(d.textContent)));
    await p.keyboard.press('Escape'); await wait(400);
  }
  if (shotsDir) await p.screenshot({ path: `${shotsDir}/size-${name}-review.png` });
  out.sizes[name] = m;
  await p.close();
}
out.files = files;
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
