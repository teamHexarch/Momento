// usage: node behave-albums.mjs <base>  -> JSON of albums-page behaviours; run on both sites and diff
import puppeteer from 'puppeteer';

const base = process.argv[2];
const CHROME = process.env.CHROME_PATH || undefined;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const errs = [];

async function open(url, { scheme = 'light', w = 1440, h = 900, motion = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion ? 'no-preference' : 'reduce' }]);
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2200);
  return page;
}
const path = (p) => new URL(p.url()).pathname + new URL(p.url()).search + new URL(p.url()).hash;

// 1. normal load
{
  const p = await open('/albums.html');
  out.title = await p.title();
  out.page = await p.evaluate(() => ({
    dataPage: document.documentElement.dataset.page, theme: document.documentElement.dataset.theme,
    albums: document.querySelectorAll('#years .album').length, years: document.querySelectorAll('#years .year').length,
    tabCounts: [...document.querySelectorAll('.tab small')].map((s) => s.textContent),
    lede: document.getElementById('lede')?.textContent, live: document.getElementById('live')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
    todo: document.querySelectorAll('#todo .todo-row:not(.todo-ghost)').length,
    footerCols: document.querySelectorAll('.site-foot .sf-col').length, footerLinks: document.querySelectorAll('.site-foot a').length,
    chip: !!document.querySelector('.me-slot button, [data-acct-host] button'), bell: !!document.querySelector('.bell, [class*="bell"]'),
    webgl: (() => { const c = document.getElementById('bg'); return !!c && c.width > 0; })(),
    introVeil: !!document.getElementById('intro'), introOn: document.documentElement.classList.contains('intro-on'),
  }));
  out.meta = await p.evaluate(() => ({
    desc: document.querySelector('meta[name=description]')?.content, canonical: document.querySelector('link[rel=canonical]')?.href,
    og: document.querySelector('meta[property="og:title"]')?.content, ogUrl: document.querySelector('meta[property="og:url"]')?.content,
    jsonld: !!document.querySelector('script[type="application/ld+json"]'), lang: document.documentElement.lang,
    viewport: document.querySelector('meta[name=viewport]')?.content,
  }));
  // nav links all point where they did
  out.navLinks = await p.evaluate(() => [...document.querySelectorAll('.nav a, .brand, .nav-menu a')].map((a) => a.getAttribute('href')));
  await p.close();
}

// 2. deep links open the album / photo set
{
  const p = await open('/albums.html#album=a2');
  out.deepAlbum = await p.evaluate(() => ({ open: document.getElementById('albumModal').open, title: document.getElementById('albumTitle').textContent, hash: location.hash }));
  await p.close();
  const q = await open('/albums.html?album=a1');
  out.deepAlbumQuery = await q.evaluate(() => ({ open: document.getElementById('albumModal').open, title: document.getElementById('albumTitle').textContent, search: location.search }));
  await q.close();
}

// 3. join links go to Social
{
  const p = await open('/albums.html#join'); out.joinHash = path(p); await p.close();
  const q = await open('/albums.html?join=ABC123'); out.joinQuery = path(q); await q.close();
}

// 4. embedded inside another Momento page: only the album shows
{
  const host = await open('/privacy.html');
  await host.evaluate((b) => { const f = document.createElement('iframe'); f.id = 'emb'; f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999'; f.src = '/albums.html?album=a2&embed=1'; document.body.append(f); }, base);
  await sleep(4500);
  const frame = host.frames().find((f) => f.url().includes('embed=1'));
  out.embed = frame ? await frame.evaluate(() => ({
    isEmbed: document.documentElement.classList.contains('is-embed'), base: document.querySelector('base')?.target,
    albumOpen: document.getElementById('albumModal')?.open, headerShown: getComputedStyle(document.getElementById('header')).display,
    bg: getComputedStyle(document.documentElement).backgroundColor,
  })) : 'no frame';
  await host.close();
}

// 5. signed out (?dev=off): sent to the login on the home page
{
  const p = await open('/albums.html?dev=off'); await sleep(2500);
  out.signedOut = path(p).replace(/\?dev=off&?/, '?');
  await p.close();
}
{ const p = await open('/?dev=on'); await p.close(); } // put sample data back on for the rest

// 6. theme + language
{
  const p = await open('/albums.html', { scheme: 'dark' });
  out.dark = await p.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.themePref, [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join('|')]);
  await p.close();
  const l = await open('/albums.html?lang=es');
  out.es = await l.evaluate(() => ({ title: document.title, h1: document.querySelector('.title')?.textContent, tab: document.querySelector('.tab')?.textContent, search: document.getElementById('search')?.placeholder, lang: document.documentElement.lang, hidden: document.documentElement.classList.contains('i18n-pending') }));
  await l.close();
  const r = await open('/albums.html?lang=ar');
  out.ar = await r.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, h1: document.querySelector('.title')?.textContent }));
  await r.close();
}

// 7. navigation both ways (real page loads, as on the original site)
{
  const p = await open('/albums.html');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('.nav-home')]); await sleep(1500);
  out.toHome = path(p);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('.nav-albums')]); await sleep(1500);
  out.backToAlbums = path(p);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('.nav-social')]); await sleep(1500);
  out.toSocial = path(p);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.evaluate(() => document.querySelector('.nav-albums').click())]); await sleep(1500);
  out.socialToAlbums = path(p);
  await p.goBack({ waitUntil: 'load' }); await sleep(1200);
  out.back = path(p);
  await p.close();
}

// 8. album actions inside the open album
{
  const p = await open('/albums.html');
  await p.evaluate(() => document.querySelector('#years .album-hit').click()); await sleep(1500);
  await p.evaluate(() => document.getElementById('albumSave').click()); await sleep(500);
  out.save = await p.evaluate(() => document.getElementById('albumSave').getAttribute('aria-pressed'));
  await p.click('#abMore'); await sleep(400);
  out.menuItems = await p.evaluate(() => [...document.querySelectorAll('#abMenu .ab-item:not([hidden])')].map((b) => b.textContent.trim()));
  await p.keyboard.press('Escape'); await sleep(300);
  out.codeBlock = await p.evaluate(() => ({ shown: !document.getElementById('albumCode').hidden, code: document.getElementById('albumCodeText').textContent }));
  await p.evaluate(() => document.querySelector('#albumModal [data-close]').click()); await sleep(500);
  out.afterClose = await p.evaluate(() => ({ albumOpen: document.getElementById('albumModal').open, hash: location.hash }));
  // create album dialog fields
  await p.evaluate(() => document.querySelector('[data-create]').click()); await sleep(1200);
  out.create = await p.evaluate(() => ({ dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className), inputs: document.querySelectorAll('dialog[open] input, dialog[open] textarea, dialog[open] select').length, title: document.querySelector('dialog[open] h2')?.textContent }));
  await p.close();
}

out.console_errors = [...new Set(errs)];
console.log(JSON.stringify(out, null, 1));
await browser.close();
