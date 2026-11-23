// usage: node behave-theme.mjs <urlA> <urlB>
// The theme (window.Momento.theme), original vs new, switched every way the site can: the footer segment, the
// account menu's segment, the Settings page's own control, Momento.theme.set from code, another tab (storage event),
// and the device's light/dark setting while "System" is chosen. With motion on, each change cross-fades (a View
// Transition), so it compares the state once the cross-fade is over (the in-between moment varies run to run). After each: <html> data-theme / data-theme-pref,
// the silk target (__theme.target), every segment's aria-checked and --i, localStorage, Momento.theme.pref/resolved.
import puppeteer from 'puppeteer';

const [, , A, B] = process.argv;
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const read = () => ({
  theme: document.documentElement.dataset.theme, pref: document.documentElement.dataset.themePref,
  target: window.__theme && window.__theme.target, stored: localStorage.getItem('momento-theme'),
  api: window.Momento.theme ? [window.Momento.theme.pref, window.Momento.theme.resolved] : null,
  segs: [...document.querySelectorAll('.acct-seg, [role="radiogroup"]')].map((s) => s.style.getPropertyValue('--i') + ':' + [...s.querySelectorAll('[aria-checked]')].map((b) => b.getAttribute('aria-checked')[0]).join('')),
});

async function run(base, path, motion) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // emulateMediaFeatures replaces the whole list, so every call passes both settings
  const media = (scheme) => page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion ? 'no-preference' : 'reduce' }]);
  await media('light');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 90000 });
  await wait(2500);
  const r = { start: await page.evaluate(read) };
  // Some changes arrive asynchronously (the device setting, another tab's storage event), so after each action wait
  // until the page has stopped changing (the same reading for 0.8 s, at most 6 s) instead of a fixed time
  const settle = async () => {
    let last = '', same = 0;
    for (let t = 0; t < 60 && same < 8; t++) { await wait(100); const now = JSON.stringify(await page.evaluate(read)); same = now === last ? same + 1 : 0; last = now; }
  };
  const step = async (name, fn) => { await fn(); await wait(motion ? 3000 : 100); await settle(); r[name] = await page.evaluate(read); };
  await step('footerDark', () => page.evaluate(() => document.querySelector('[data-site-foot] [data-theme="dark"]').click()));
  await step('apiLight', () => page.evaluate(() => Momento.theme.set('light')));
  // the account menu's segment (opened from the chip)
  await step('menuOpen', () => page.evaluate(() => document.querySelector('.acct-btn')?.click()));
  await step('menuSystem', () => page.evaluate(() => document.querySelector('#acctMenu [data-theme="system"]')?.click()));
  await step('menuClosed', () => page.keyboard.press('Escape'));
  // "System" follows the device
  await step('deviceDark', () => media('dark'));
  await step('deviceLight', () => media('light'));
  // another tab chooses dark
  await step('otherTab', async () => { const o = await ctx.newPage(); await o.goto(base + '/terms.html'); await o.evaluate(() => localStorage.setItem('momento-theme', 'dark')); await o.close(); });
  if (path === '/settings.html') {
    await step('settingsLight', () => page.evaluate(() => [...document.querySelectorAll('main [role="radiogroup"] button[data-theme="light"], .s-group [data-theme="light"]')].pop()?.click()));
  }
  // a fresh load keeps the choice
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(2500);
  r.reloaded = await page.evaluate(read);
  r.errors = errors;
  await ctx.close();
  return r;
}

let diffs = 0;
const walk = (x, y, at) => {
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${at}.${k}`); return; }
  if (JSON.stringify(x) !== JSON.stringify(y)) { diffs++; console.log(`${at}\n   original: ${JSON.stringify(x)}\n   new:      ${JSON.stringify(y)}`); }
};
let sample;
for (const path of ['/albums.html', '/settings.html', '/support.html', '/events.html', '/']) {
  for (const motion of [false, true]) {
    const a = await run(A, path, motion), b = await run(B, path, motion);
    if (path === '/settings.html' && !motion) sample = { start: a.start.theme, footerDark: a.footerDark.theme, deviceDark: a.deviceDark.theme, otherTab: a.otherTab.theme, settingsLight: a.settingsLight?.theme, segs: a.footerDark.segs };
    walk(a, b, `${path} ${motion ? 'motion' : 'reduced'}`);
  }
}
await browser.close();
console.log('sanity (original, settings):', JSON.stringify(sample));
console.log(diffs ? `\n${diffs} difference(s)` : '\nTheme identical');
