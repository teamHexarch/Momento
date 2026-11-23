// usage: node touch-check.mjs [base=http://localhost:3001]
// Touch gestures on a phone-sized screen: swiping through photos in the full-size viewer (including a finger lifted
// over the strip while a photo is still sliding, which used to leave swiping stuck), and pinching to zoom the camera.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await browser.defaultBrowserContext().overridePermissions(base, ['camera']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const cdp = await page.createCDPSession();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
async function swipe(x0, x1, y = 420, steps = 6, endAt = null) {
  await touch('touchStart', [[x0, y]]);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y]]); await wait(12); }
  if (endAt) { await touch('touchMove', [endAt]); }
  await touch('touchEnd', []);
}
const count = () => page.evaluate(() => document.getElementById('vwCount').textContent.replace(/\s+/g, ' ').trim());
const out = {};

await page.goto(base + '/albums?dev=reset#album=a1', { waitUntil: 'networkidle2' });
await wait(3500);
await page.evaluate(() => document.querySelector('#thumbs .ab-tile').click());
await wait(1500);
out.open = await count();
// five swipes in a row, each after the last has landed
out.swipes = [];
for (let i = 0; i < 5; i++) { await swipe(320, 60); await wait(1000); out.swipes.push(await count()); }
// the old trap: a touch while a photo is still sliding, lifted over the strip at the bottom
await swipe(320, 60); await wait(60);
const film = await page.evaluate(() => { const r = document.getElementById('vwFilm').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await touch('touchStart', [[200, 420]]); await touch('touchMove', [film]); await touch('touchEnd', []);
await wait(800);
out.afterTrap = await count();
out.moreSwipes = [];
for (let i = 0; i < 3; i++) { await swipe(320, 60); await wait(1000); out.moreSwipes.push(await count()); }
await swipe(60, 330); await wait(1000);
out.back = await count();
await page.keyboard.press('Escape'); await wait(600);
await page.keyboard.press('Escape'); await wait(800);

// ---- camera: pinch out and in, one finger starting on the bottom bar ----
await page.evaluate(() => { window.__cam = Momento.event.camera(); });
await wait(2500);
const zoom = () => page.evaluate(() => ({ range: document.querySelector('.ev-zchip[aria-pressed="true"]').textContent, video: document.querySelector('.ev-cam video').style.transform }));
out.camStart = await zoom();
await touch('touchStart', [[195, 330], [195, 760]]);   // the second finger lands on the bottom bar
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[195, 330 - i * 22], [195, 760 + i * 6]]); await wait(20); }
await touch('touchEnd', []); await wait(300);
out.camPinchOut = await zoom();
await touch('touchStart', [[195, 200], [195, 600]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[195, 200 + i * 20], [195, 600 - i * 20]]); await wait(20); }
await touch('touchEnd', []); await wait(300);
out.camPinchIn = await zoom();
// one finger on the shutter alone still takes a photo
const sh = await page.evaluate(() => { const r = document.querySelector('.ev-shutter').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await page.evaluate(() => { window.__sev = []; const sb = document.querySelector('.ev-shutter'); for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'click']) sb.addEventListener(t, (e) => window.__sev.push(t + ':' + e.pointerId)); });
out.atShutter = await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return (e?.className || e?.tagName || '').toString().slice(0, 40) + ' | toast shown: ' + !!document.querySelector('.m-toast:popover-open'); }, sh[0], sh[1]);
await touch('touchStart', [sh]); await touch('touchEnd', []);
for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelectorAll('.ev-shots img').length)); i++) await wait(250);
out.shutterTap = await page.evaluate(() => document.querySelectorAll('.ev-shots img').length);
out.shutterEvents = await page.evaluate(() => window.__sev.join(',') + ' | status: ' + document.querySelector('.ev-cam-status').textContent + ' | video ' + document.querySelector('.ev-cam video').videoWidth);
out.pageZoomed = await page.evaluate(() => visualViewport.scale);
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
