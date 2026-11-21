// usage: node interact-pages.mjs <A> <B> <outDir> <settings|support|events>
// Same click-through on both sites; screenshots + generic page state are compared after every step.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , A, B, OUT, PAGE] = process.argv;
const CHROME = process.env.CHROME_PATH || undefined;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Generic, page-independent snapshot of what a person could observe
const STATE = () => {
  const vis = (e) => !!(e && !e.closest('[hidden]') && e.getClientRects().length);
  const dlg = [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className);
  return {
    url: location.pathname + location.search + location.hash,
    title: document.title,
    theme: [document.documentElement.dataset.theme, document.documentElement.dataset.themePref, document.documentElement.lang],
    dialogs: dlg,
    aria: [...document.querySelectorAll('main [aria-checked], main [aria-expanded], main [aria-selected], main [aria-pressed]')].map((e) => (e.id || e.dataset.topic || e.dataset.theme || e.dataset.m || (e.textContent || '').trim().slice(0, 14)) + '=' + (e.getAttribute('aria-checked') ?? e.getAttribute('aria-expanded') ?? e.getAttribute('aria-selected') ?? e.getAttribute('aria-pressed'))).join('|'),
    visibleButtons: [...document.querySelectorAll('main button, main input, main textarea')].filter(vis).length,
    status: [...document.querySelectorAll('main [role=status], main .s-note, main .note, main .gr-status, main .ev-status, .m-toast')].filter(vis).map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70)).join(' / '),
    values: [...document.querySelectorAll('main input:not([type=hidden]):not([type=range]), main textarea')].map((e) => e.value).join('|'),
    texts: ['nameNow', 'emailNow', 'langBtnText', 'evStatus', 'grStatus', 'storeTotal'].map((i) => document.getElementById(i)?.textContent?.trim().slice(0, 40)).join('|'),
    counts: [['.gt', 'groups'], ['#evList > *', 'events'], ['.eh-open', 'hosted'], ['.qa.is-open, .faq-item.is-open', 'faq-open']].map(([s, n]) => n + ':' + document.querySelectorAll(s).length).join(' '),
    scrollY: Math.round(scrollY),
  };
};

const clickText = (p, sel, text, nth = 0) => p.evaluate((sel, text, nth) => { const l = [...document.querySelectorAll(sel)].filter((e) => !e.closest('[hidden]') && !e.hidden && (!text || e.textContent.trim().startsWith(text))); l[nth].click(); }, sel, text, nth);
const clickVisible = (p, sel, nth = 0) => p.evaluate((sel, nth) => { const l = [...document.querySelectorAll(sel)].filter((e) => !e.closest('[hidden]') && !e.hidden && e.getClientRects().length); l[nth].click(); }, sel, nth);
const esc = async (p) => { await p.keyboard.press('Escape'); await sleep(700); };

const STEPS = {
  settings: [
    ['01-start', async () => {}],
    ['02-name-change', async (p) => { await clickText(p, 'button.s-change', 'Change', 0); await sleep(700); }],
    ['03-name-cancel', async (p) => { await clickVisible(p, '.s-cancel', 0); await sleep(700); }],
    ['04-email-change', async (p) => { await clickText(p, 'button.s-change', 'Change', 1); await sleep(700); }],
    ['05-email-cancel', async (p) => { await clickVisible(p, '.s-cancel', 0); await sleep(700); }],
    ['06-password-change', async (p) => { await clickText(p, 'button.s-change', 'Change', 2); await sleep(700); }],
    ['07-password-cancel', async (p) => { await clickVisible(p, '.s-cancel', 0); await sleep(700); }],
    ['08-switch-events', async (p) => { await clickVisible(p, '.s-sw', 0); await sleep(1000); }],
    ['09-switch-activity', async (p) => { await clickVisible(p, '.s-sw', 1); await sleep(1000); }],
    ['10-theme-dark', async (p) => { await p.evaluate(() => document.querySelector('main [role=radio][data-theme="dark"]').click()); await sleep(1200); }],
    ['11-theme-light', async (p) => { await p.evaluate(() => document.querySelector('main [role=radio][data-theme="light"]').click()); await sleep(1200); }],
    ['12-theme-system', async (p) => { await p.evaluate(() => document.querySelector('main [role=radio][data-theme="system"]').click()); await sleep(1200); }],
    ['13-lang-menu', async (p) => { await p.click('#langBtn'); await sleep(900); }],
    ['14-lang-hover', async (p) => { await p.keyboard.press('ArrowDown'); await sleep(500); }],
    ['15-lang-closed', async (p) => { await esc(p); }],
    ['16-keep-switch', async (p) => { await p.evaluate(() => document.getElementById('keepSw').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#keepSw'); await sleep(900); }],
    ['17-clear-cache', async (p) => { await p.evaluate(() => document.getElementById('clearCache').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#clearCache'); await sleep(1100); }],
    ['18-delete-open', async (p) => { await p.evaluate(() => document.getElementById('deleteAcct').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#deleteAcct'); await sleep(900); }],
    ['19-language-es', async (p) => { await p.goto(p.url().split('?')[0] + '?lang=es', { waitUntil: 'networkidle2' }); await sleep(2500); }],
    ['20-language-es-menu', async (p) => { await p.click('#langBtn'); await sleep(900); }],
    ['21-logout', async (p) => { await esc(p); await p.evaluate(() => document.getElementById('logOut').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#logOut'); await sleep(2500); }],
  ],
  support: [
    ['01-start', async () => {}],
    ['02-faq-1', async (p) => { await clickVisible(p, 'main .qa button, main .faq button, main button[aria-expanded]', 0); await sleep(800); }],
    ['03-faq-2', async (p) => { await clickVisible(p, 'main .qa button, main .faq button, main button[aria-expanded]', 1); await sleep(800); }],
    ['04-faq-1-closed', async (p) => { await clickVisible(p, 'main .qa button, main .faq button, main button[aria-expanded]', 0); await sleep(800); }],
    ['05-topic-uploads', async (p) => { await p.click('[data-topic="Uploads"]'); await sleep(600); }],
    ['06-topic-other', async (p) => { await p.click('[data-topic="Something else"]'); await sleep(600); }],
    ['07-submit-empty', async (p) => { await p.evaluate(() => document.getElementById('supportForm').scrollIntoView({ block: 'center' })); await sleep(500); await clickVisible(p, '#supportForm [type="submit"]'); await sleep(900); }],
    ['08-type-message', async (p) => { await p.type('#supportForm textarea', 'The upload stopped at 80% and did not resume.'); await sleep(500); }],
    ['09-submit', async (p) => { await clickVisible(p, '#supportForm [type="submit"]'); await sleep(2200); }],
    ['10-send-another', async (p) => { await p.evaluate(() => document.getElementById('sendAnother')?.click()); await sleep(900); }],
    ['11-help-window', async (p) => { await p.evaluate(() => document.getElementById('openHelp').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#openHelp'); await sleep(1400); }],
    ['12-help-closed', async (p) => { await esc(p); }],
    ['13-footer-theme-dark', async (p) => { await p.evaluate(() => document.querySelector('.site-foot [role=radio][data-theme="dark"]')?.click()); await sleep(1200); }],
    ['14-account-menu', async (p) => { await p.evaluate(() => { window.scrollTo(0, 0); }); await sleep(400); await p.evaluate(() => document.querySelector('.me-slot button, [data-acct-host] button')?.click()); await sleep(900); }],
  ],
  events: [
    ['01-start', async () => {}],
    ['02-jump-events', async (p) => { await p.evaluate(() => document.querySelector('.so-jump-item[href="#events"]').click()); await sleep(1200); }],
    ['03-jump-groups', async (p) => { await p.evaluate(() => document.querySelector('.so-jump-item[href="#groups"]').click()); await sleep(1200); }],
    ['04-new-group', async (p) => { await p.click('#grNew'); await sleep(1400); }],
    ['05-new-group-closed', async (p) => { await esc(p); await sleep(400); }],
    ['06-group-open', async (p) => { await clickVisible(p, '.gt', 0); await sleep(1600); }],
    ['07-group-closed', async (p) => { await esc(p); await sleep(500); }],
    ['08-join-modal', async (p) => { await p.evaluate(() => document.getElementById('joinOpen').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#joinOpen'); await sleep(1200); }],
    ['09-join-typed', async (p) => { await p.keyboard.type('ABC1234'); await sleep(700); }],
    ['10-join-submit', async (p) => { await p.keyboard.press('Enter'); await sleep(1500); }],
    ['11-join-closed', async (p) => { await esc(p); await sleep(500); }],
    ['12-range-5km', async (p) => { await p.evaluate(() => document.getElementById('evRange').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#evRange [data-m="5000"]'); await sleep(700); }],
    ['13-range-keys', async (p) => { await p.keyboard.press('ArrowRight'); await sleep(600); }],
    ['14-notify-switch', async (p) => { await p.click('#evNotify'); await sleep(1100); }],
    ['15-search-type', async (p) => { await p.click('#evSearch'); await p.type('#evSearch', 'Lon'); await sleep(1800); }],
    ['16-search-cleared', async (p) => { await p.$eval('#evSearch', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await esc(p); }],
    ['17-scan-nearby', async (p) => { await p.click('#evLocate'); await sleep(4500); }],
    ['18-hosted-settings', async (p) => { await p.evaluate(() => { const c = document.querySelector('.ea-chip'); c?.scrollIntoView({ block: 'center' }); c?.click(); }); await sleep(1600); }],
    ['19-hosted-settings-closed', async (p) => { await esc(p); await sleep(400); }],
    ['20-qr-scan-open', async (p) => { await p.evaluate(() => document.getElementById('scanOpen').scrollIntoView({ block: 'center' })); await sleep(500); await p.click('#scanOpen'); await sleep(1500); }],
    ['21-qr-scan-closed', async (p) => { await esc(p); await sleep(500); }],
  ],
};

async function run(base, cfg) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(base, ['geolocation']);
  const page = await ctx.newPage();
  await page.setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
  await page.setViewport({ width: cfg.w, height: cfg.h, deviceScaleFactor: 1, isMobile: cfg.mobile, hasTouch: cfg.mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: cfg.scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 150)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(base + `/${PAGE}.html`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3000);
  const out = [];
  for (const [name, fn] of STEPS[PAGE]) {
    let err = null;
    try { await fn(page); } catch (e) { err = e.message.slice(0, 110); }
    const file = path.join(OUT, `${cfg.name}-${name}-${base.endsWith('3000') ? 'A' : 'B'}.png`);
    let state = null;
    for (let k = 0; k < 6; k++) {
      try { await sleep(k ? 1500 : 0); await page.screenshot({ path: file }); state = await page.evaluate(STATE); break; }
      catch (e) { state = { stateError: e.message.slice(0, 60) }; }
    }
    out.push({ name, file, state, err });
  }
  await ctx.close();
  return { out, errors };
}

const configs = [
  { name: 'desk', w: 1440, h: 900, scheme: 'light', mobile: false },
  { name: 'mob', w: 390, h: 844, scheme: 'dark', mobile: true },
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let worst = 0, stateDiffs = 0, stepErrs = 0;
for (const cfg of configs) {
  const a = await run(A, cfg), b = await run(B, cfg);
  console.log(`\n=== ${PAGE} ${cfg.name} (${cfg.w}x${cfg.h}) console errors\n  A: ${JSON.stringify([...new Set(a.errors)])}\n  B: ${JSON.stringify([...new Set(b.errors)])}`);
  for (let i = 0; i < a.out.length; i++) {
    const x = a.out[i], y = b.out[i];
    const pa = PNG.sync.read(fs.readFileSync(x.file)), pb = PNG.sync.read(fs.readFileSync(y.file));
    let px = -1;
    if (pa.width === pb.width && pa.height === pb.height) {
      const diff = new PNG({ width: pa.width, height: pa.height });
      px = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
      fs.writeFileSync(path.join(OUT, `${cfg.name}-${x.name}-diff.png`), PNG.sync.write(diff));
    }
    const same = JSON.stringify(x.state) === JSON.stringify(y.state);
    if (!same) stateDiffs++;
    if (x.err || y.err) stepErrs++;
    const pct = px < 0 ? 100 : (100 * px) / (pa.width * pa.height); worst = Math.max(worst, pct);
    console.log(`${x.name.padEnd(26)} ${String(px).padStart(7)} px (${pct.toFixed(3)}%)  state ${same ? 'same' : 'DIFFERENT'}${x.err || y.err ? `  stepErr A:${x.err} B:${y.err}` : ''}`);
    if (!same) { for (const k of Object.keys(x.state)) if (JSON.stringify(x.state[k]) !== JSON.stringify(y.state[k])) console.log(`     ${k}: A=${JSON.stringify(x.state[k])}  B=${JSON.stringify(y.state[k])}`); }
  }
}
console.log(`\nworst step: ${worst.toFixed(3)}%   steps with different page state: ${stateDiffs}   steps that errored in the test: ${stepErrs}`);
await browser.close();
