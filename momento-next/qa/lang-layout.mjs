// Does any language break the layout? Every page in every language at phone, tablet and desktop size, looking for:
//   overlap  - two buttons / links / fields / labels drawn on top of each other
//   spill    - text that runs out of its button or chip (clipped or drawn past its edge)
//   wide     - the page is wider than the screen (sideways scrolling)
//   NEXT_URL=http://localhost:3002 node qa/lang-layout.mjs [page ...]      LANGS=yue,ar  VIEWS=phone,tablet  ALL=1
// Only problems English doesn't also have are printed, unless ALL=1.
import puppeteer from 'puppeteer';

const BASE = process.env.NEXT_URL || 'http://localhost:3002';
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/albums', '/events', '/settings', '/support', '/reviews', '/terms', '/privacy', '/no-such-page'];
const LANGS = (process.env.LANGS || 'en,zh,hi,es,ar,fr,bn,pt,ru,ur,yue,id').split(',');
if (!LANGS.includes('en')) LANGS.unshift('en');
const VIEWS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  small: { width: 340, height: 720, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1100, height: 760 },
  fold: { width: 600, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  ipad: { width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  mid: { width: 720, height: 1000 },
};
const views = (process.env.VIEWS || 'small,phone,tablet,laptop,desktop').split(',');

function scan(rootSel) {
  const W = innerWidth;
  const root = rootSel ? document.querySelector(rootSel) : document;
  const name = (n) => {
    let s = n.tagName.toLowerCase();
    if (n.id) return s + '#' + n.id;
    if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
    const p = n.parentElement;
    return (p && p !== document.body ? (p.id ? '#' + p.id : p.tagName.toLowerCase() + (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : '')) + ' > ' : '') + s;
  };
  const shown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' && n !== el) return false;
      if (n.tagName === 'DIALOG' && !n.open) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  // Is the element really the one painted at its own centre (not hidden under a sheet / behind a closed panel)?
  const onTop = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 0), W - 1), y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return true;   // off screen: can't test, assume yes
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  };
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, label, [role=button], [role=tab], [role=switch], [role=menuitem], .chip, .pill, .tab, h1, h2, h3, h4';
  const els = [...root.querySelectorAll(sel)].filter(shown);
  const out = [];
  const sy = scrollY;
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top + sy, r: r.right, b: r.bottom + sy, w: r.width, h: r.height }; };
  // the fixed / sticky layer an element is drawn in (null = the page itself); content scrolling under a fixed header
  // is how scrolling works, not an overlap, so only things in the same layer are compared
  const layer = (el) => { for (let n = el; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
  // a link that wraps onto two lines is two boxes, not the rectangle around both
  const frags = (el) => getComputedStyle(el).display === 'inline' ? [...el.getClientRects()].map((r) => ({ l: r.left, t: r.top + sy, r: r.right, b: r.bottom + sy })) : [box(el)];
  const B = els.map((el) => ({ el, b: box(el), fr: frags(el), f: layer(el) }));
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], c = B[j];
    if (a.f !== c.f) continue;
    if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
    if (a.el.tagName === 'LABEL' && (a.el.control === c.el)) continue;
    if (c.el.tagName === 'LABEL' && (c.el.control === a.el)) continue;
    let ox = 0, oy = 0;
    for (const p of a.fr) for (const q of c.fr) {
      const x = Math.min(p.r, q.r) - Math.max(p.l, q.l), y = Math.min(p.b, q.b) - Math.max(p.t, q.t);
      if (x > 3 && y > 3) { ox = x; oy = y; }
    }
    if (ox > 3 && oy > 3) {
      if (!onTop(a.el) && !onTop(c.el)) continue;
      out.push({ k: 'overlap', who: name(a.el) + '  ×  ' + name(c.el), txt: ((a.el.innerText || a.el.value || '').trim().slice(0, 24) + ' | ' + (c.el.innerText || c.el.value || '').trim().slice(0, 24)).replace(/\s+/g, ' '), px: Math.round(ox) + 'x' + Math.round(oy) });
    }
  }
  // text drawn outside its own box (buttons, chips, tabs, labels, small text holders)
  const tsel = 'button, a, label, [role=button], [role=tab], .chip, .pill, .tab, .badge, span, strong, small, p, h1, h2, h3, h4, li, td, th, div';
  for (const el of root.querySelectorAll(tsel)) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp) continue;    // deliberately cut with "…"
    const r = el.getBoundingClientRect();
    const range = document.createRange();
    let over = 0;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        over = Math.max(over, r.left - q.left, q.right - r.right, (r.top - q.top) * 0.5, (q.bottom - r.bottom) * 0.5);
      }
    }
    // clipped by an ancestor that hides overflow?
    let clip = 0;
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') clip = el.scrollWidth - el.clientWidth;
    if (over > 4 || (clip > 3 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll')) {
      out.push({ k: 'spill', who: name(el), txt: el.textContent.trim().slice(0, 30).replace(/\s+/g, ' '), px: Math.round(Math.max(over, clip)) + 'px' });
    }
    if (r.right > W + 2 && cs.position !== 'fixed' && onTop(el)) {
      let inScroller = false;
      for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { inScroller = true; break; } }
      if (!inScroller) out.push({ k: 'offscreen', who: name(el), txt: el.textContent.trim().slice(0, 30).replace(/\s+/g, ' '), px: Math.round(r.right - W) + 'px' });
    }
  }
  if (document.documentElement.scrollWidth > W + 1) out.push({ k: 'wide', who: 'page', txt: '', px: (document.documentElement.scrollWidth - W) + 'px' });
  return out;
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const base = {};   // view|page -> Set of English signatures
let total = 0; const lines = [];
await Promise.all(views.map(async (v) => {
  const ctx = await browser.createBrowserContext();
  let page;
  const fresh = async () => {
    if (page) await page.close().catch(() => {});
    page = await ctx.newPage();
    await page.setViewport(VIEWS[v]);
    await page.goto(BASE + '/?dev', { waitUntil: 'load' });     // sample data on, intro seen
    await new Promise((r) => setTimeout(r, 2500));
  };
  await fresh();
  for (const p of PAGES) {
    for (const l of LANGS) {
      for (let attempt = 0; ; attempt++) try {
        const url = BASE + p + (p.includes('?') ? '&' : '?') + 'lang=' + l;
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        await new Promise((r) => setTimeout(r, 1500));
        let found = [];
        // scan the whole page, a screen at a time, so fixed things are checked against what's under them
        const H = await page.evaluate(() => document.documentElement.scrollHeight);
        const seen = new Set();
        for (let y = 0; y < Math.min(H, 12000); y += VIEWS[v].height * 0.8) {
          await page.evaluate((y) => scrollTo(0, y), y);
          await new Promise((r) => setTimeout(r, 120));
          for (const f of await page.evaluate(scan)) { const s = f.k + ' ' + f.who; if (!seen.has(s)) { seen.add(s); found.push(f); } }
        }
        // every pop-up on the page, opened one at a time
        const dialogs = await page.evaluate(() => [...document.querySelectorAll('dialog')].map((d, i) => { d.dataset.llScan = i; return i; }));
        for (const i of dialogs) {
          const ok = await page.evaluate((i) => { const d = document.querySelector(`dialog[data-ll-scan="${i}"]`); try { if (!d.open) d.showModal(); return true; } catch { return false; } }, i);
          if (!ok) continue;
          await new Promise((r) => setTimeout(r, 500));
          for (const f of await page.evaluate(scan, `dialog[data-ll-scan="${i}"]`)) { f.who = `dialog${await page.evaluate((i) => { const d = document.querySelector(`dialog[data-ll-scan="${i}"]`); return d.id ? '#' + d.id : '.' + d.className.split(' ')[0]; }, i)}: ` + f.who; const s = f.k + ' ' + f.who; if (!seen.has(s)) { seen.add(s); found.push(f); } }
          await page.evaluate((i) => document.querySelector(`dialog[data-ll-scan="${i}"]`).close(), i);
        }
        // every menu / dropdown (a button with aria-expanded), opened one at a time
        await page.evaluate(() => scrollTo(0, 0));
        const toggles = await page.evaluate(() => [...document.querySelectorAll('[aria-expanded="false"]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(b).visibility !== 'hidden'; }).map((b, i) => { b.dataset.llT = i; return i; }));
        for (const i of toggles.slice(0, 8)) {
          const t = `[data-ll-t="${i}"]`;
          try {
            await page.evaluate((t) => { const b = document.querySelector(t); b.scrollIntoView({ block: 'center' }); b.click(); }, t);
            await new Promise((r) => setTimeout(r, 600));
            const tn = await page.evaluate((t) => { const b = document.querySelector(t); return b.getAttribute('aria-expanded') === 'true' ? (b.id || b.className.split(' ')[0] || b.tagName) : null; }, t);
            if (tn) for (const f of await page.evaluate(scan)) { f.who = `open ${tn}: ` + f.who; const s = f.k + ' ' + f.who; if (!seen.has(s)) { seen.add(s); found.push(f); } }
            await page.keyboard.press('Escape');
            await page.evaluate((t) => { const b = document.querySelector(t); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); }, t);
            await new Promise((r) => setTimeout(r, 300));
            if (!page.url().includes(p === '/' ? '' : p)) break;
          } catch {}
        }
        const key = v + '|' + p;
        if (l === 'en') { base[key] = new Set(found.map((f) => f.k + ' ' + f.who)); if (!process.env.ALL) break; }
        else if (!process.env.ALL) found = found.filter((f) => !base[key].has(f.k + ' ' + f.who));
        for (const f of found) { total++; lines.push([v.padEnd(7), p.padEnd(13), l.padEnd(4), f.k.padEnd(9), f.px.padEnd(8), f.who, ' "' + f.txt + '"'].join(' ')); }
        break;
      } catch (e) {
        // a menu item that navigates away (or a crashed tab): start a clean tab and try this language once more
        if (attempt) { lines.push(`${v} ${p} ${l} ERROR ${e.message.slice(0, 80)}`); break; }
        await fresh();
      }
    }
  }
  await ctx.close();
}));
console.log(lines.sort().join(String.fromCharCode(10)));
console.log(`\n${total} problems`);
await browser.close();
