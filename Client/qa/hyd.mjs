import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
let bad = 0, n = 0;
for (const q of ['', '?dev=off', '?lang=es', '?lang=ar&dev=off']) {
  for (const pg of ['', 'albums.html', 'support.html', 'settings.html', 'events.html']) {
    const p = await b.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error' && /hydrat|script tag/i.test(m.text())) errs.push(m.text().slice(0, 60)); });
    p.on('pageerror', (e) => { if (/hydrat/i.test(e.message)) errs.push('pageerror ' + e.message.slice(0, 50)); });
    await p.goto((process.env.NEXT_URL || 'http://localhost:3001') + '/' + pg + q, { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1500));
    n++; if (errs.length) { bad++; console.log(('/' + pg + q).padEnd(26), 'HYDRATION ERRORS', errs.length); }
    await p.close();
  }
}
console.log(`${n} page loads, ${bad} with hydration errors`);
await b.close();
