// usage: node behave-toast.mjs <urlA> <urlB>
// The toast (window.Momento.toast / Momento.flash), original vs new, driven the way the page scripts call it:
// plain, danger and with an Undo action; read in the same tick (callers rely on that); inside an open dialog and back
// out when it closes; auto-hide timing and hover-to-hold; and a flash carried over a reload. Prints only differences.
import puppeteer from 'puppeteer';

const [, , A, B] = process.argv;
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = () => {
  const t = document.querySelector('.m-toast');
  if (!t) return null;
  return {
    html: t.outerHTML.replace(/ style="[^"]*"/, ''),
    parent: t.parentElement.tagName + (t.parentElement.id ? '#' + t.parentElement.id : ''),
    open: t.matches(':popover-open'), visibility: t.style.visibility, count: document.querySelectorAll('.m-toast').length,
  };
};

async function run(base, path, mobile) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__toasts = [];
    const iv = setInterval(() => { const M = window.Momento; if (M && M.toast && !M.toast.__w) { const o = M.toast; M.toast = function (...a) { window.__toasts.push(a[0]); return o.apply(this, a); }; M.toast.__w = 1; } }, 5);
    setTimeout(() => clearInterval(iv), 20000);
  });
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  // Reduced motion: the toast's fades are skipped, so these checks judge its logic, not animation timing (which
  // drifts on a busy machine). The animated path is covered by the screenshot click-throughs.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 90000 });
  await wait(2500);
  const r = {};
  r.before = await page.evaluate(state);
  r.plain = await page.evaluate((s) => { Momento.toast('Album saved', 'Find it in My albums'); return eval(`(${s})`)(); }, state.toString());
  r.danger = await page.evaluate((s) => { Momento.toast('Photo deleted', '', { danger: true }); return eval(`(${s})`)(); }, state.toString());
  r.undo = await page.evaluate((s) => {
    window.__undone = 0;
    Momento.toast('3 photos removed', 'From Imaad’s 18th', { danger: true, action: { label: 'Undo', run: () => { window.__undone++; } } });
    return eval(`(${s})`)();
  }, state.toString());
  await page.click('.m-toast .m-toast-act');
  await wait(1000);
  r.afterUndo = await page.evaluate((s) => ({ undone: window.__undone, ...eval(`(${s})`)() }), state.toString());
  // inside an open dialog, then back out when it closes
  await page.evaluate(() => Momento.openHelp(null));
  await wait(700);
  r.inDialog = await page.evaluate((s) => { Momento.toast('Link copied'); return eval(`(${s})`)(); }, state.toString());
  await page.keyboard.press('Escape');
  await wait(1500);
  r.dialogClosed = await page.evaluate(state);
  // timing (shown 3.4 s, then a 0.22 s fade): still there at 2 s, gone by 5 s
  await page.evaluate(() => Momento.toast('Timing'));
  await wait(2000);
  r.at2s = await page.evaluate(() => document.querySelector('.m-toast').style.visibility);
  await wait(3000);
  r.at5s = await page.evaluate(() => document.querySelector('.m-toast').style.visibility);
  if (!mobile) {
    // hovering holds it past its time
    await page.evaluate(() => Momento.toast('Hold me'));
    await page.hover('.m-toast');
    await wait(5000);
    r.heldWhileHovered = await page.evaluate(() => document.querySelector('.m-toast').style.visibility);
    await page.mouse.move(5, 5);
    await wait(3500);
    r.goneAfterLeave = await page.evaluate(() => document.querySelector('.m-toast').style.visibility);
  }
  // flash: a toast for the next page
  await page.evaluate(() => Momento.flash('Logged out', 'See you soon'));
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(4000);
  r.flash = await page.evaluate(() => window.__toasts);
  r.flashOnScreenOnce = await page.evaluate(() => document.querySelector('.m-toast b')?.textContent);
  r.flashStoreCleared = await page.evaluate(() => sessionStorage.getItem('momento-flash'));
  r.errors = errors;
  await page.close();
  return r;
}

let diffs = 0;
const walk = (x, y, at) => {
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${at}.${k}`); return; }
  if (JSON.stringify(x) !== JSON.stringify(y)) { diffs++; console.log(`${at}\n   original: ${JSON.stringify(x)}\n   new:      ${JSON.stringify(y)}`); }
};
const sample = {};
for (const path of ['/albums.html', '/support.html', '/settings.html', '/events.html', '/']) {
  for (const mobile of [false, true]) {
    const a = await run(A, path, mobile), b = await run(B, path, mobile);
    if (path === '/albums.html' && !mobile) Object.assign(sample, { plain: a.plain?.parent, inDialog: a.inDialog?.parent, flash: !!a.flash, undone: a.afterUndo?.undone });
    walk(a, b, `${path} ${mobile ? 'phone' : 'desktop'}`);
  }
}
await browser.close();
console.log('sanity (original, albums desktop):', JSON.stringify(sample));
console.log(diffs ? `\n${diffs} difference(s)` : '\nToast identical');
