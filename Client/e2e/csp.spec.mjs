// The Content-Security-Policy (scripts/csp.mjs) blocks nothing the site needs: every page, signed out and signed in,
// and the flows that load from other addresses (sign-up's reCAPTCHA and Google sign-in, the Events globe and its
// tiles, the album and its Games, the event form's venue search with Google Maps). Any block fails the test. Also
// checks that the policy is really there and that an injected inline script can't run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));
const PAGES = ['/', '/albums', '/events', '/settings', '/support', '/privacy', '/terms', '/reviews', '/groups.html', '/review.html', '/no-such-page'];

// Every block the browser reports (in this page and the frames inside it), with what was blocked and by which rule
async function watchBlocks(page) {
  const blocks = [];
  // (and which outside services were really reached, so "nothing blocked" means something)
  const reached = new Set();
  page.on('request', (r) => { try { reached.add(new URL(r.url()).hostname); } catch (e) {} });
  await page.exposeFunction('__cspBlock', (b) => blocks.push(b));
  await page.addInitScript(() => {
    try { localStorage.setItem('momento-dev', '0'); } catch (e) {}
    addEventListener('securitypolicyviolation', (e) => window.__cspBlock?.(`${location.pathname}: ${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'}${e.sample ? ` "${e.sample.slice(0, 60)}"` : ''}`));
  });
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) blocks.push(`console: ${m.text().slice(0, 240)}`); });
  return { blocks, reached };
}
const settle = (page, ms = 2500) => page.waitForTimeout(ms);

test('signed out: every page loads with nothing blocked, sign-up loads reCAPTCHA', async ({ page }) => {
  const { blocks, reached } = await watchBlocks(page);
  for (const p of PAGES) {
    await page.goto(p);
    await settle(page);
    // The policy is in the page, near the top of <head>
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), `${p} has a policy`).toBe(1);
  }
  // Sign-up: reCAPTCHA (and Google sign-in's script) load from Google
  await page.goto('/');
  await page.waitForFunction(() => typeof window.openAuth === 'function');
  await page.evaluate(() => window.openAuth({ mode: 'signup' }));
  // (its "I'm not a robot" box appears when Create account is pressed)
  const form = page.locator('form:has([name="password"]):visible').first();
  await form.locator('[name="name"]').fill('Policy Check');
  await form.locator('[name="email"]').fill('policy-check@example.invalid');
  await form.locator('[name="password"]').fill('Policy-check-123');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('iframe[src*="/recaptcha/"]').first()).toBeAttached({ timeout: 20000 });
  await settle(page, 3000);
  expect(blocks, 'nothing blocked by the Content-Security-Policy').toEqual([]);
  for (const host of ['www.google.com', 'accounts.google.com']) expect(reached.has(host), `${host} was reached`).toBe(true);
});

test('signed in: every page, an album with its Games, the globe and the event form load with nothing blocked', async ({ page }, info) => {
  const s = seed(), who = `${info.project.name}-csp`;
  const { blocks, reached } = await watchBlocks(page);
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[who], password: s.password } });
  expect(login.status()).toBe(200);
  for (const p of PAGES) { await page.goto(p); await settle(page, 2000); }

  // Join the event and open its album (it opens in a frame), then its Games window
  await page.goto(`/albums?join=${s.code.replace('-', '')}`);
  const album = page.frameLocator('dialog[open] iframe').first();
  await expect(album.locator('#albumModal[open] #albumTitle')).toHaveText('Smoke test party');
  await album.locator('#abGames').click();
  await expect(album.locator('#gamesModal[open]')).toBeVisible();
  await settle(page);

  // The Events globe: MapLibre from unpkg, its worker, and the satellite tiles
  await page.goto('/events#events');
  await expect(page.locator('#evMap canvas')).toBeAttached({ timeout: 30000 });
  await settle(page, 5000);

  // The event form's venue search: Google Maps (the server has a Maps key)
  await page.goto('/albums');
  await page.waitForFunction(() => typeof window.Momento?.createAlbum === 'function');
  await page.evaluate(() => window.Momento.createAlbum(document.body, { kind: 'event' }));
  await page.locator('#mCreate input[name="name"]').fill('Policy check');
  await page.locator('#mCreate [type="submit"]').click();
  await expect(page.locator('#mCreate .ev-venue')).toBeVisible();
  await settle(page, 5000);
  expect(blocks, 'nothing blocked by the Content-Security-Policy').toEqual([]);
  for (const host of ['unpkg.com', 'server.arcgisonline.com', 'maps.googleapis.com']) expect(reached.has(host), `${host} was reached`).toBe(true);
});

test('an inline script that isn\'t part of the page is blocked', async ({ page }) => {
  const { blocks, reached } = await watchBlocks(page);
  await page.goto('/albums');
  // What an injected script would look like if one slipped into the page (a comment or name, rendered as HTML)
  const ran = await page.evaluate(() => new Promise((resolve) => {
    window.__injected = false;
    const host = document.createElement('div');
    host.innerHTML = '<img src="x" onerror="window.__injected = true">';
    document.body.append(host);
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true';
    document.body.append(s);
    setTimeout(() => resolve(window.__injected), 800);
  }));
  expect(ran, 'injected code did not run').toBe(false);
  expect(blocks.length, 'the browser reported the blocks').toBeGreaterThan(0);
});
