// usage: node behave.mjs <base>   -> prints a JSON summary of behaviours (run for both sites and diff)
import puppeteer from 'puppeteer';

const base = process.argv[2];
const CHROME = process.env.CHROME_PATH || undefined;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const errs = [];

async function open(url, { motion = true, scheme = 'light', w = 1440, h = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion ? 'no-preference' : 'reduce' }]);
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 90000 });
  return page;
}

// 1. Intro plays (fresh tab session) and finishes
{
  const page = await open('/');
  out.intro_on_at_start = await page.evaluate(() => document.documentElement.classList.contains('intro-on') || !document.getElementById('intro'));
  await sleep(9000);
  out.intro_done = await page.evaluate(() => !document.documentElement.classList.contains('intro-on') && !document.getElementById('intro'));
  out.intro_seen_flag = await page.evaluate(() => sessionStorage.getItem('momento-intro-home'));
  // 2. Page built by the scripts
  out.footer_cols = await page.evaluate(() => document.querySelectorAll('.site-foot .sf-col').length);
  out.footer_links = await page.evaluate(() => document.querySelectorAll('.site-foot a').length);
  out.album_children = await page.evaluate(() => document.querySelector('.album')?.children.length);
  out.floaters = await page.evaluate(() => document.querySelectorAll('.floaters > *').length);
  out.img_src_set = await page.evaluate(() => [...document.querySelectorAll('img[data-p]')].every((i) => i.src && i.src.includes('/assets/photos/')));
  out.qr_rects = await page.evaluate(() => document.querySelectorAll('#qrHero rect').length);
  out.webgl_canvas = await page.evaluate(() => { const c = document.getElementById('bg'); return !!c && c.width > 0; });
  out.signed_in_chip = await page.evaluate(() => !!document.querySelector('.auth-in:not([hidden])'));
  // 3. Nav caret menu
  await page.click('.nav-caret'); await sleep(500);
  out.nav_menu_open = await page.evaluate(() => document.querySelector('.nav-caret').getAttribute('aria-expanded'));
  // 4. FAQ accordion
  await page.evaluate(() => document.getElementById('faq').scrollIntoView()); await sleep(1200);
  await page.click('.qa button'); await sleep(600);
  out.faq_open = await page.evaluate(() => document.querySelector('.qa button').getAttribute('aria-expanded'));
  // 5. Zone slider
  await page.evaluate(() => document.getElementById('features').scrollIntoView()); await sleep(1200);
  await page.evaluate(() => { const r = document.getElementById('zoneR'); r.value = 90; r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(400);
  out.zone = await page.evaluate(() => [document.getElementById('zoneOut').textContent, document.getElementById('zoneIn').textContent, document.getElementById('zoneAll').textContent]);
  // 6. Quality compare slider
  out.qc_before = await page.evaluate(() => getComputedStyle(document.getElementById('qc')).getPropertyValue('--pos') || document.querySelector('.qc-line').style.cssText);
  await page.evaluate(() => { const r = document.getElementById('qcRange'); r.value = 20; r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
  out.qc_after = await page.evaluate(() => getComputedStyle(document.getElementById('qc')).getPropertyValue('--pos') || document.querySelector('.qc-line').style.cssText);
  // 7. How-it-works steps cycle
  await page.evaluate(() => document.getElementById('how-it-works').scrollIntoView()); await sleep(1500);
  await page.click('.hiw-card:nth-child(3) .hiw-btn'); await sleep(500);
  out.hiw_current = await page.evaluate(() => [...document.querySelectorAll('.hiw-btn')].findIndex((b) => b.getAttribute('aria-current') === 'step'));
  // 8. Auth dialog: only via the signed-out path, so open it with the script's own helper
  await page.goto(base + '/?dev=off', { waitUntil: 'networkidle2' }); await sleep(2500);   // signed-out view
  out.signed_out_buttons = await page.evaluate(() => [...document.querySelectorAll('#authOut [data-auth]')].map((b) => b.textContent.trim()));
  out.openAuth_fn = await page.evaluate(() => typeof window.openAuth);
  await page.evaluate(() => window.openAuth({ mode: 'signup' })); await sleep(700);
  out.auth_open = await page.evaluate(() => document.getElementById('authDialog').open);
  out.auth_mode = await page.evaluate(() => document.getElementById('authForm').dataset.mode);
  await page.click('.auth-tabs button[data-mode="login"]'); await sleep(500);
  out.auth_mode_after_tab = await page.evaluate(() => document.getElementById('authForm').dataset.mode);
  out.auth_title = await page.evaluate(() => document.getElementById('authTitle').textContent);
  await page.click('.auth-close'); await sleep(500);
  out.auth_closed = await page.evaluate(() => !document.getElementById('authDialog').open);
  // 9. QR scan -> album opens
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800);
  await page.click('#qrScan'); await sleep(3500);
  out.album_visible_after_scan = await page.evaluate(() => getComputedStyle(document.querySelector('.album')).visibility);
  out.album_pages = await page.evaluate(() => document.querySelector('.pa-count')?.textContent);
  await page.close();
}

// 10. Hash link skips intro and lands on section
{
  const page = await open('/#faq');
  await sleep(2500);
  out.hash_intro_skipped = await page.evaluate(() => !document.documentElement.classList.contains('intro-on'));
  out.hash_scrolled = await page.evaluate(() => scrollY > 1000);
  await page.close();
}

// 11. Theme
{
  const page = await open('/', { motion: false, scheme: 'dark' });
  out.theme_dark = await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.themePref]);
  out.theme_color_meta = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
  await page.close();
}

// 12. Language
{
  const page = await open('/?lang=es', { motion: false });
  await sleep(1500);
  out.es_hero = await page.evaluate(() => document.querySelector('.hero-title')?.textContent.trim());
  out.es_i18n = await page.evaluate(() => typeof window.Momento?.t);
  out.es_misc = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, faq: document.querySelector('.qa button span')?.textContent, hiw: document.querySelector('.hiw-title')?.textContent, foot: document.querySelector('.site-foot a')?.textContent, pending: document.documentElement.classList.contains('i18n-pending') }));
  await page.close();
}
{
  const page = await open('/?lang=ar', { motion: false });
  await sleep(1500);
  out.ar_misc = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, hero: document.querySelector('.hero-title')?.textContent.trim(), faq: document.querySelector('.qa button span')?.textContent }));
  await page.close();
}

// 13. Head meta
{
  const page = await open('/', { motion: false });
  out.title = await page.title();
  out.meta = await page.evaluate(() => ({
    desc: document.querySelector('meta[name=description]')?.content?.slice(0, 40),
    og: document.querySelector('meta[property="og:title"]')?.content,
    canonical: document.querySelector('link[rel=canonical]')?.href,
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    viewport: document.querySelector('meta[name=viewport]')?.content,
    jsonld: !!document.querySelector('script[type="application/ld+json"]'),
    lang: document.documentElement.lang,
  }));
  await page.close();
}

out.console_errors = [...new Set(errs)];
console.log(JSON.stringify(out, null, 1));
await browser.close();
