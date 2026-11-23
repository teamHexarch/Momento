import puppeteer from 'puppeteer';
const [base, out, w, h] = [process.argv[2], process.argv[3], +process.argv[4] || 390, +process.argv[5] || 844];
const b = await puppeteer.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await b.defaultBrowserContext().overridePermissions(base, ['camera']);
const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/albums?dev=reset', { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 3000));
await p.evaluate(() => { window.__cam = Momento.event.camera(); }); await new Promise(r => setTimeout(r, 2500));
if (process.argv[6] === 'shot') { await p.click('.ev-shutter'); await new Promise(r => setTimeout(r, 1500)); }
await p.screenshot({ path: out }); console.log('errors', errs); await b.close();
