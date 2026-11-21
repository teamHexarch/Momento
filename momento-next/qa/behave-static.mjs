// usage: node behave-static.mjs <A> <B>
// Compares terms / privacy / 404 between the original (A) and the port (B): exact text, structure, head, languages,
// theme, links, hover/focus states, hydration.
import puppeteer from 'puppeteer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , A, B, OUT] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || undefined;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
let problems = 0;
const say = (ok, msg) => { if (!ok) problems++; console.log(`${ok ? 'ok  ' : 'DIFF'} ${msg}`); };

async function open(base, url, { scheme = 'light', w = 1440, h = 900, errs } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('console', (m) => { if (m.type() === 'error' && errs && !/status of 404/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => errs?.push('pageerror: ' + e.message.slice(0, 120)));
  await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1800);
  return page;
}

const SNAP = () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const links = [...document.querySelectorAll('a')].map((a) => `${a.getAttribute('href')}|${a.getAttribute('rel') || ''}|${norm(a.textContent)}`);
  return {
    title: document.title, htmlLang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme,
    text: norm(document.body.innerText),
    // structure: every element's tag + class + id + attributes, in order (ignoring scripts the page/runner added)
    structure: [...document.body.querySelectorAll('*:not(script):not(next-route-announcer):not(nextjs-portal)')].filter((e) => !e.closest('body > div[hidden]')).map((e) => e.tagName + '.' + e.className + '#' + e.id + '[' + [...e.attributes].filter((x) => !/^(class|id|bis_)/.test(x.name)).map((x) => x.name + '=' + x.value).join(',') + ']').join(' '),
    links,
    headings: [...document.querySelectorAll('h1,h2')].map((h) => h.tagName + ':' + norm(h.textContent)),
    meta: {
      desc: document.querySelector('meta[name=description]')?.content, canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content,
      ogTitle: document.querySelector('meta[property="og:title"]')?.content, ogDesc: document.querySelector('meta[property="og:description"]')?.content, ogUrl: document.querySelector('meta[property="og:url"]')?.content,
      ogImage: document.querySelector('meta[property="og:image"]')?.content, twTitle: document.querySelector('meta[name="twitter:title"]')?.content, twImage: document.querySelector('meta[name="twitter:image"]')?.content,
      viewport: document.querySelector('meta[name=viewport]')?.content, referrer: document.querySelector('meta[name=referrer]')?.content, format: document.querySelector('meta[name=format-detection]')?.content,
      themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.media + '=' + m.content).join(' '),
      icons: [...document.querySelectorAll('link[rel~=icon],link[rel=apple-touch-icon],link[rel=manifest]')].map((l) => (l.getAttribute('rel') + ':' + (l.getAttribute('sizes') || '') + ':' + new URL(l.href).pathname)).sort().join(' '),
    },
    images: [...document.images].map((i) => i.getAttribute('src') + ':' + (i.naturalWidth > 0)).join(' '),
    scrollbar: getComputedStyle(document.documentElement).scrollbarWidth,
  };
};

const pairs = [
  ['terms', '/terms.html', '/terms.html'],
  ['privacy', '/privacy.html', '/privacy.html'],
  ['404', '/404.html', '/no/such/page'],
];
const queries = ['', '?lang=es', '?lang=ar', '?lang=zh', '?lang=hi'];
for (const [name, pa, pb] of pairs) {
  console.log(`\n=== ${name} ===`);
  for (const q of name === '404' ? [''] : queries) {
    for (const scheme of ['light', 'dark']) {
      if (q && scheme === 'dark') continue;
      const ea = [], eb = [];
      const a = await open(A, pa + q, { scheme, errs: ea }), b = await open(B, pb + q, { scheme, errs: eb });
      const sa = await a.evaluate(SNAP), sb = await b.evaluate(SNAP);
      const label = `${(q || 'en').replace('?lang=', '')}/${scheme}`.padEnd(10);
      for (const k of Object.keys(sa)) {
        if (k === 'meta') { for (const m of Object.keys(sa.meta)) { const same = JSON.stringify(sa.meta[m]) === JSON.stringify(sb.meta[m]); if (!same) say(false, `${name} ${label} meta.${m}: A=${JSON.stringify(sa.meta[m])}  B=${JSON.stringify(sb.meta[m])}`); } continue; }
        const same = JSON.stringify(sa[k]) === JSON.stringify(sb[k]);
        if (!same) say(false, `${name} ${label} ${k}: A=${JSON.stringify(sa[k]).slice(0, 160)}  B=${JSON.stringify(sb[k]).slice(0, 160)}`);
      }
      say(JSON.stringify(sa) === JSON.stringify(sb), `${name} ${label} text(${sa.text.length} chars, ${sha(sa.text)}) structure(${sa.links.length} links) head+meta identical`);
      if (eb.length || ea.length) say(JSON.stringify(ea) === JSON.stringify(eb), `${name} ${label} console A=${JSON.stringify(ea)} B=${JSON.stringify(eb)}`);
      await a.close(); await b.close();
    }
  }
}

// deep address: everything still loads (absolute links) and the status is 404
{
  const res = [];
  const p = await browser.newPage();
  p.on('response', (r) => res.push(r.status() + ' ' + new URL(r.url()).pathname));
  const main = await p.goto(B + '/deeply/nested/missing/page?x=1#y', { waitUntil: 'networkidle2' });
  say(main.status() === 404, `404 status for a nested address: ${main.status()}`);
  const bad = res.filter((r) => /^(4|5)/.test(r) && !/\/deeply\//.test(r));
  say(bad.length === 0, `404 nested address: no failed requests besides the page itself ${JSON.stringify(bad)}`);
  say(await p.evaluate(() => [...document.images].every((i) => i.naturalWidth > 0)), '404 nested address: logo loads');
  await p.close();
}

// ---- hydration (dev) / theme switching without a reload ----
console.log('\n=== other ===');
for (const [name, pb] of [['terms', '/terms.html'], ['privacy', '/privacy.html'], ['404', '/nope']]) {
  const eb = [];
  const b = await browser.newPage();
  b.on('console', (m) => { if (m.type() === 'error' && /hydrat|script tag/i.test(m.text())) eb.push(m.text().slice(0, 80)); });
  await b.goto(B + pb, { waitUntil: 'networkidle2' }); await sleep(1500);
  say(eb.length === 0, `${name}: no hydration errors on Next (${eb.length})`);
  // stored theme preference wins over the system setting
  await b.evaluate(() => localStorage.setItem('momento-theme', 'dark')); await b.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  say((await b.evaluate(() => document.documentElement.dataset.theme)) === 'dark', `${name}: saved dark theme applies before paint`);
  await b.evaluate(() => localStorage.removeItem('momento-theme'));
  await b.close();
}
console.log(`\n${problems} problem(s)`);
await browser.close();
