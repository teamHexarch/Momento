// usage: node behave-account.mjs <urlA> <urlB>
// The account store (window.Momento.account / Momento.sessionReady), original vs new, on every app page, signed in
// (sample data) and signed out (?dev=off): what sessionReady resolves to, Momento.account.get(), what is kept in
// sessionStorage, the account chip, the footer's "Account settings", Support's form pre-fill, Settings' name field;
// then a change made through Momento.account.set and a logout from the account menu. Prints only differences.
import puppeteer from 'puppeteer';

const [, , A, B] = process.argv;
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const read = () => {
  const M = window.Momento;
  const chip = document.querySelector('.acct-btn');
  return {
    get: M.account && M.account.get(),
    stored: sessionStorage.getItem('momento-account'),
    chip: chip ? { text: chip.textContent.replace(/\s+/g, ' ').trim(), shown: !!chip.getClientRects().length } : null,
    authOutShown: (() => { const o = document.getElementById('authOut'); return o ? !o.hidden && !!o.getClientRects().length : null; })(),
    footAccountHidden: document.querySelector('[data-foot-account]')?.hidden ?? null,
    supportForm: document.getElementById('supportForm') ? [document.getElementById('supportForm').name.value, document.getElementById('supportForm').email.value] : null,
  };
};

async function run(base, path, query) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path + query, { waitUntil: 'networkidle2', timeout: 90000 });
  await wait(2500);
  const r = { ready: await page.evaluate(() => Momento.sessionReady.then((u) => u, (e) => 'rejected: ' + e.message)), start: await page.evaluate(read) };
  if (r.start.get) {
    await page.evaluate(() => Momento.account.set({ name: 'Priya Shah', notify: { recap: true } }));
    await wait(500);
    r.afterSet = await page.evaluate(read);
    // log out from the account menu
    await page.evaluate(() => document.querySelector('.acct-btn')?.click());
    await wait(600);
    // logging out loads the home page: wait for it to finish loading, then let its scripts start
    const nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);
    const out = await page.evaluate(() => { const b = [...document.querySelectorAll('#acctMenu button, #acctMenu a')].find((x) => /log out/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
    r.loggedOutClicked = out;
    await nav;
    await wait(3000);
    r.afterLogout = { url: new URL(page.url()).pathname, ...(await page.evaluate(read)) };
  }
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
  for (const query of ['', '?dev=off']) {
    const a = await run(A, path, query), b = await run(B, path, query);
    if (path === '/support.html' && !query) sample = { name: a.start.get?.name, notify: a.start.get?.notify, chip: a.start.chip?.text, form: a.start.supportForm, logout: a.loggedOutClicked, after: a.afterLogout?.url };
    walk(a, b, `${path}${query}`);
  }
}
await browser.close();
console.log('sanity (original, support):', JSON.stringify(sample));
console.log(diffs ? `\n${diffs} difference(s)` : '\nAccount identical');
