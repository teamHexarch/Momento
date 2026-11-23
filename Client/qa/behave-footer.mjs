// usage: node behave-footer.mjs <urlA> <urlB>
// The site footer on every app page, original vs new: its markup (tags, attributes, text), the theme segment and the
// "Account settings" item (signed in and signed out), and what clicking it does (theme switch, Back to top, and on a phone
// the folding groups). Prints only the differences.
import puppeteer from 'puppeteer';

const [, , A, B] = process.argv;
const PAGES = ['/', '/albums.html', '/events.html', '/settings.html', '/support.html'];
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// Every element under the footer: tag, attributes (minus React/whitespace noise), own text
const snapshot = () => {
  const foot = document.querySelector('[data-site-foot]');
  if (!foot) return null;
  const out = [];
  for (const el of [foot, ...foot.querySelectorAll('*')]) {
    const attrs = [...el.attributes].map((a) => `${a.name}=${a.value}`).sort().join(' ');
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').replace(/\s+/g, ' ').trim();
    out.push(`${el.tagName.toLowerCase()} [${attrs}] ${text}`);
  }
  const seg = foot.querySelector('.acct-seg');
  return { nodes: out, segI: seg.style.getPropertyValue('--i'), checked: [...seg.querySelectorAll('[aria-checked="true"]')].map((b) => b.dataset.theme),
    acctHidden: foot.querySelector('[data-foot-account]').hidden };
};

async function run(base, path, { mobile = false, query = '' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path + query, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2000));
  const r = { initial: await page.evaluate(snapshot) };
  if (r.initial) {
    await page.click('[data-site-foot] .acct-seg [data-theme="dark"]');
    await new Promise((x) => setTimeout(x, 600));
    r.afterDark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, pref: document.documentElement.dataset.themePref,
      checked: [...document.querySelectorAll('[data-site-foot] .acct-seg [aria-checked="true"]')].map((b) => b.dataset.theme),
      segI: document.querySelector('[data-site-foot] .acct-seg').style.getPropertyValue('--i') }));
    await page.click('[data-site-foot] .acct-seg [data-theme="system"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await new Promise((x) => setTimeout(x, 400));
    await page.click('[data-site-foot] .sf-top');
    await new Promise((x) => setTimeout(x, 800));
    r.afterTop = await page.evaluate(() => Math.round(scrollY));
    if (mobile) {
      await page.evaluate(() => document.querySelector('#sfAlbums .sf-head').scrollIntoView());
      await page.click('#sfAlbums .sf-head');
      await new Promise((x) => setTimeout(x, 900));
      r.afterFold = await page.evaluate(() => [...document.querySelectorAll('[data-site-foot] .sf-col')].map((c) => `${c.className}|${c.querySelector('.sf-head').getAttribute('aria-expanded')}`));
      await page.click('#sfAlbums .sf-head');
      await new Promise((x) => setTimeout(x, 900));
      r.afterUnfold = await page.evaluate(() => [...document.querySelectorAll('[data-site-foot] .sf-col')].map((c) => `${c.className}|${c.querySelector('.sf-head').getAttribute('aria-expanded')}`));
    }
  }
  r.errors = errors;
  await page.close();
  return r;
}

let diffs = 0;
const walk = (x, y, at) => {
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${at}.${k}`); return; }
  if (JSON.stringify(x) !== JSON.stringify(y)) { diffs++; console.log(`${at}\n   original: ${JSON.stringify(x)}\n   new:      ${JSON.stringify(y)}`); }
};
for (const path of PAGES) {
  for (const opts of [{}, { mobile: true }, { query: '?dev=off' }]) {
    const label = `${path} ${opts.mobile ? 'phone' : 'desktop'}${opts.query || ''}`;
    walk(await run(A, path, opts), await run(B, path, opts), label);
  }
}
await browser.close();
console.log(diffs ? `\n${diffs} difference(s)` : '\nFooter identical');
