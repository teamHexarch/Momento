// usage: node reviews-check.mjs [base=http://localhost:3001]
// Exercises the Reviews page against the sample data: summary, list, show more, sort, star filter, posting, editing
// and deleting your review, and the signed-out view. Prints what it saw and any page errors.
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|status of 40[134]/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
const out = {};
const state = () => page.evaluate(() => ({
  avg: document.querySelector('.rv-avg')?.textContent,
  sub: document.querySelector('.rv-score-side small')?.textContent,
  items: document.querySelectorAll('.rv-list .rv-item').length,
  firstStars: document.querySelector('.rv-list .rv-item .rv-stars')?.getAttribute('aria-label'),
  more: !!document.querySelector('.rv-more .btn'),
  filter: document.querySelector('.rv-filter')?.textContent.trim() || '',
  writeTitle: document.getElementById('rvWriteTitle')?.textContent,
  mine: document.querySelector('.rv-mine .rv-body')?.textContent || '',
  note: document.querySelector('.rv-write .sp-note')?.textContent || '',
  login: !!document.querySelector('.rv-login'),
  toast: document.querySelector('.m-toast b')?.textContent || '',
}));
await page.goto(base + '/reviews?dev=reset', { waitUntil: 'networkidle2' });
await wait(3000);
out.start = await state();
await page.click('.rv-more .btn'); await wait(800);
out.showMore = await state();
await page.click('.rv-seg [role="radio"]:nth-of-type(3)'); await wait(800);   // Lowest
out.lowest = await state();
await page.click('.rv-bar[aria-pressed="false"]:not(:disabled)'); await wait(800);   // the first bar with reviews (5 stars)
out.filtered = await state();
await page.click('.rv-filter'); await wait(800);
out.unfiltered = await state();
// Write: posting without stars, then a real review
await page.click('.rv-write form button[type="submit"]'); await wait(300);
out.noStars = (await state()).note;
await page.click('.rv-pick-star:nth-child(4)'); await wait(200);
await page.type('.rv-write textarea', 'Too short');
await page.click('.rv-write form button[type="submit"]'); await wait(300);
out.tooShort = (await state()).note;
await page.type('.rv-write textarea', ' — we used it for a birthday and everyone added photos.');
await page.type('.rv-write input', 'Great for a birthday');
await page.click('.rv-write form button[type="submit"]'); await wait(1500);
out.posted = await state();
// Edit it to 5 stars
await page.click('.rv-mine .btn'); await wait(300);
await page.click('.rv-pick-star:nth-child(5)');
await page.click('.rv-write form button[type="submit"]'); await wait(1500);
out.edited = await state();
// Delete it (through the confirm window)
await page.click('.rv-delete'); await wait(800);
out.confirm = await page.evaluate(() => document.querySelector('#mConfirm[open] h2')?.textContent || '');
await page.click('#mConfirm [data-ok]'); await wait(1500);
out.deleted = await state();
// Signed out
await page.goto(base + '/reviews?dev=off', { waitUntil: 'networkidle2' }); await wait(2500);
out.signedOut = await state();
await page.goto(base + '/reviews?dev=on', { waitUntil: 'networkidle2' }); await wait(1000);
// The footer link and the old address
out.footerLink = await page.evaluate(() => !!document.querySelector('.site-foot a[href="reviews"]'));
const old = await page.goto(base + '/reviews.html', { waitUntil: 'domcontentloaded' });
out.oldAddress = `${old.status()} ${new URL(page.url()).pathname}`;
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
