import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
const [, , A, B, OUT] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let problems = 0;
const say = (ok, msg) => { if (!ok) problems++; console.log(`${ok ? 'ok  ' : 'DIFF'} ${msg}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, protocolTimeout: 120000 });
const center = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);

async function states(base, url, scheme, tag) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);   // motion NOT reduced: the buttons have a hover lift
  await p.goto(base + url, { waitUntil: 'networkidle2' }); await sleep(1200);
  await p.bringToFront();
  const shots = {};
  let c = await center(p, '.btn-dark'); await p.mouse.move(c.x, c.y); await sleep(700);
  shots['hover-dark'] = await p.screenshot();
  c = await center(p, '.btn-light'); await p.mouse.move(c.x, c.y); await sleep(700);
  shots['hover-light'] = await p.screenshot();
  c = await center(p, 'a.brand'); await p.mouse.move(c.x, c.y); await sleep(500);
  shots['hover-brand'] = await p.screenshot();
  await p.mouse.move(5, 5); await sleep(300);
  // press (active) state
  c = await center(p, '.btn-dark'); await p.mouse.move(c.x, c.y); await p.mouse.down(); await sleep(500);
  shots['press-dark'] = await p.screenshot(); await p.mouse.move(5, 5); await p.mouse.up();   // released outside: no click
  await p.mouse.move(5, 5); await sleep(300);
  // keyboard focus rings, one stop at a time
  for (let i = 1; i <= 6; i++) { await p.keyboard.press('Tab'); await sleep(350); shots[`tab${i}`] = await p.screenshot(); }
  const focused = (await p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20))) + ' @' + new URL(p.url()).pathname.replace(/^\/no\/such\/page$/, '/404');
  await p.close();
  return { shots, focused };
}

for (const scheme of ['light', 'dark']) {
  const a = await states(A, '/404.html', scheme, 'A'), b = await states(B, '/no/such/page', scheme, 'B');
  for (const k of Object.keys(a.shots)) {
    const pa = PNG.sync.read(Buffer.from(a.shots[k])), pb = PNG.sync.read(Buffer.from(b.shots[k]));
    const px = pixelmatch(pa.data, pb.data, new PNG({ width: pa.width, height: pa.height }).data, pa.width, pa.height, { threshold: 0.1 });
    say(px === 0, `404 ${scheme} ${k}: ${px} px differ`);
    if (k === 'tab1' || k === 'hover-dark') fs.writeFileSync(path.join(OUT, `404-${scheme}-${k}-B.png`), b.shots[k]);
  }
  say(a.focused === b.focused, `404 ${scheme}: after 6 Tab presses focus is on "${a.focused}" / "${b.focused}"`);
}
console.log(`\n${problems} problem(s)`);
await browser.close();
