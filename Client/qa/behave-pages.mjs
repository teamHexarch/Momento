// usage: node behave-pages.mjs <base>  -> JSON of behaviours for social/settings/support; run on both sites and diff
import puppeteer from 'puppeteer';

const base = process.argv[2];
const CHROME = process.env.CHROME_PATH || undefined;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const errs = [];

async function open(url, { scheme = 'light', w = 1440, h = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('console', (m) => { if (m.type() === 'error') errs.push(url.split('?')[0] + ' ' + m.text().slice(0, 130)); });
  page.on('pageerror', (e) => errs.push(url.split('?')[0] + ' pageerror: ' + e.message.slice(0, 130)));
  await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2500);
  return page;
}
const where = (p) => { const u = new URL(p.url()); return u.pathname + u.search + u.hash; };
const META = () => ({
  title: document.title, lang: document.documentElement.lang, dataPage: document.documentElement.dataset.page,
  desc: document.querySelector('meta[name=description]')?.content, canonical: document.querySelector('link[rel=canonical]')?.href,
  ogTitle: document.querySelector('meta[property="og:title"]')?.content, ogDesc: document.querySelector('meta[property="og:description"]')?.content, ogUrl: document.querySelector('meta[property="og:url"]')?.content,
  twTitle: document.querySelector('meta[name="twitter:title"]')?.content, referrer: document.querySelector('meta[name=referrer]')?.content,
  themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.media).join(','),
  icons: [...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon]')].length,
  navLinks: [...document.querySelectorAll('.nav a, .brand, .nav-menu a')].map((a) => a.getAttribute('href')).join(' '),
  footerLinks: document.querySelectorAll('.site-foot a').length, footerCols: document.querySelectorAll('.site-foot .sf-col').length,
  chip: !!document.querySelector('.me-slot button, [data-acct-host] button'), webgl: !!document.getElementById('bg') && document.getElementById('bg').width > 0,
  introVeil: !!document.getElementById('intro'), scripts: [...document.scripts].filter((s) => s.src && !s.src.includes('_next') && !s.src.includes('hmr')).map((s) => s.src.split('/').pop().split('?')[0]).filter((n) => !/^(src_|node_modules|turbopack|_[0-9a-z-]+\._|[0-9a-z]+_next)/.test(n)).sort().join(','),
});

for (const pg of ['events', 'settings', 'support']) {
  const p = await open(`/${pg}.html`);
  out[pg] = await p.evaluate(META);
  await p.close();
}

// ---- Social ----
{
  const p = await open('/events.html');
  out.events_page = await p.evaluate(() => ({
    groups: document.querySelectorAll('.gt').length, hosted: document.querySelectorAll('.eh-open').length, needs: !document.getElementById('soNeed').hidden,
    settling: document.querySelector('main.page').classList.contains('is-settling'),
    mapCanvas: !!document.querySelector('#evMap canvas'), maplib: typeof window.maplibregl, mapVersion: window.maplibregl?.getVersion?.(),
    range: document.querySelector('#evRange [aria-checked=true]')?.dataset.m, notify: document.getElementById('evNotify').getAttribute('aria-checked'),
    status: document.getElementById('evStatus')?.textContent.trim(), lede: document.querySelector('.so-lede')?.textContent,
  }));
  out.events_noscript = await p.evaluate(() => document.querySelector('noscript')?.textContent || document.querySelector('noscript')?.innerHTML);
  await p.close();
  for (const [k, u] of Object.entries({ hashJoin: '/events.html#join', hashGroups: '/events.html#groups', hashEvents: '/events.html#events', queryJoin: '/events.html?join=ABC1234', queryGroup: '/events.html?group=ZZZ9999', hostedHash: '/events.html#requests=a1' })) {
    const q = await open(u);
    out['events_' + k] = await q.evaluate(() => ({ url: location.pathname + location.search + location.hash, dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), code: document.getElementById('joinCode')?.value, scroll: Math.round(scrollY) > 100, title: document.querySelector('dialog[open] h2')?.textContent }));
    await q.close();
  }
}

// ---- Settings ----
{
  const p = await open('/settings.html');
  out.settings_page = await p.evaluate(() => ({
    name: document.getElementById('nameNow')?.textContent, email: document.getElementById('emailNow')?.textContent, lang: document.getElementById('langBtnText')?.textContent,
    groups: document.querySelectorAll('.s-group').length, switches: [...document.querySelectorAll('.s-sw')].map((s) => s.getAttribute('aria-checked')).join(''),
    theme: document.querySelector('main [role=radio][aria-checked=true]')?.dataset.theme, i18nKeys: Object.keys(window.Momento?.i18n || {}).join(','),
    store: [...document.getElementById('storeTotal')?.textContent ? [document.getElementById('storeTotal').textContent] : []][0],
    langMenuOptions: document.querySelectorAll('#langMenu .s-lang-opt').length, bodyMenu: document.body.lastElementChild?.id || document.body.lastElementChild?.className,
  }));
  await p.close();
  const l = await open('/settings.html?lang=fr');
  out.settings_fr = await l.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent, lang: document.getElementById('langBtnText')?.textContent, htmlLang: document.documentElement.lang, pending: document.documentElement.classList.contains('i18n-pending') }));
  await l.close();
  const r = await open('/settings.html?lang=ur');
  out.settings_ur = await r.evaluate(() => ({ dir: document.documentElement.dir, h1: document.querySelector('h1')?.textContent, htmlLang: document.documentElement.lang }));
  await r.close();
  const s = await open('/settings.html?dev=off'); await sleep(2500);
  out.settings_signedOut = where(s); await s.close();
  await open('/?dev=on').then((x) => x.close());
}

// ---- Support ----
{
  const p = await open('/support.html');
  out.support_page = await p.evaluate(() => ({
    name: document.querySelector('#supportForm input[name=name]')?.value ?? [...document.querySelectorAll('#supportForm input')].map((i) => i.value).join('|'),
    topic: document.querySelector('#supportForm [role=radio][aria-checked=true]')?.dataset.topic, faq: document.querySelectorAll('main button[aria-expanded]').length,
    mailto: document.querySelector('a.s-row[href^=mailto]')?.getAttribute('href'), links: [...document.querySelectorAll('a.s-row')].map((a) => a.getAttribute('href')).join(' '),
  }));
  await p.close();
  const l = await open('/support.html?lang=es');
  out.support_es = await l.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent, faq: document.querySelector('main button[aria-expanded] span, main button[aria-expanded]')?.textContent.trim() }));
  await l.close();
  const s = await open('/support.html?dev=off'); await sleep(2500);
  out.support_signedOut = where(s);
  out.support_signedOutForm = await s.evaluate(() => [...document.querySelectorAll('#supportForm input')].map((i) => i.value).join('|'));
  await s.close();
  await open('/?dev=on').then((x) => x.close());
}

// ---- dark theme carries over ----
for (const pg of ['events', 'settings', 'support']) {
  const p = await open(`/${pg}.html`, { scheme: 'dark' });
  out[pg + '_dark'] = await p.evaluate(() => [document.documentElement.dataset.theme, [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join('|')]);
  await p.close();
}

// ---- moving around: every nav link on each new page loads a real page ----
for (const pg of ['events', 'settings', 'support']) {
  const p = await open(`/${pg}.html`);
  const hrefs = await p.evaluate(() => [...new Set([...document.querySelectorAll('.nav a, .site-foot a, .brand')].map((a) => a.getAttribute('href')).filter((h) => h && !h.startsWith('#') && !h.startsWith('mailto') && !h.startsWith('http')))]);
  const res = {};
  for (const h of hrefs) res[h] = await p.evaluate(async (u) => { const x = await fetch(new URL(u, location.href)); const t = await x.text(); return x.status + ' ' + (/<title>([^<]*)<\/title>/.exec(t)?.[1] || ''); }, h);
  out[pg + '_links'] = res;
  await p.close();
}

out.console_errors = [...new Set(errs)].sort();
console.log(JSON.stringify(out, null, 1));
await browser.close();
