// usage: node smoke.mjs [baseUrl=http://localhost:3001]
// Quick smoke test (not a comparison): loads every page once and lists JavaScript errors and failed scripts.
import puppeteer from 'puppeteer';
const base = process.argv[2] || 'http://localhost:3001';
const PAGES = ['/', '/albums.html', '/events.html', '/settings.html', '/support.html', '/terms.html', '/privacy.html', '/albums.html?dev=off'];
const b = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const path of PAGES) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|status of 404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await p.goto(base + path, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2500));
  const M = await p.evaluate(() => Object.keys(window.Momento || {}).sort().join(','));
  console.log(`${errs.length ? 'ERR ' : 'ok  '} ${path}  Momento: ${M}`);
  errs.forEach((e) => console.log('       ' + e));
  bad += errs.length;
  await p.close();
}
await b.close();
console.log(bad ? `\n${bad} error(s)` : '\nno errors');
