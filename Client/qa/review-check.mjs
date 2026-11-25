// usage: node review-check.mjs [base=http://localhost:3002] [shots-folder]
// The camera's review screen (open the last photo, swipe, crop with a shape and by dragging a corner, delete) and the
// upload confirmation's crosses (leave photos out). Phone-sized, with touch and Chrome's fake camera.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3002';
const shotsDir = process.argv[3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
out.files = files;
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
