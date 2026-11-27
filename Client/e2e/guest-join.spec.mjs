// Guests get in without being asked where they are: a new event checks guests' location only when the host turns
// that on. The host makes an event with the real form (venue from "Use my location", the location check left off);
// then a guest who hasn't allowed location joins with its code, straight into the album.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));
// datetime-local text for a time this many minutes from now
const local = (min) => { const d = new Date(Date.now() + min * 60000); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

test('a new event lets guests in without asking where they are', async ({ browser }, info) => {
  const s = seed();
  const name = `Join test ${info.project.name}`;

  // The host makes the event (location allowed, for "Use my location"; their own phone, not the guest's)
  const hostCtx = await browser.newContext({ ...info.project.use, permissions: ['geolocation'], geolocation: { latitude: -37.8136, longitude: 144.9631 } });
  const host = await hostCtx.newPage();
  await host.addInitScript((theme) => { try { localStorage.setItem('momento-dev', '0'); if (theme) localStorage.setItem('momento-theme', theme); } catch (e) {} }, process.env.SHOTS_THEME || '');
  expect((await host.request.post(`${s.api}/api/auth/login`, { data: { email: s.host, password: s.password } })).status()).toBe(200);
  await host.goto('/albums');
  await host.waitForFunction(() => typeof window.Momento?.createAlbum === 'function');
  await host.evaluate(() => window.Momento.createAlbum(document.body, { kind: 'event' }));
  const form = host.locator('#mCreate');
  await form.locator('input[name="name"]').fill(name);
  await form.locator('[type="submit"]').click();
  // (the date fields open Momento's own picker and can't be typed in; set them the way the picker does)
  const setWhen = (field, value) => form.locator(`input[name="${field}"]`).evaluate((el, v) => {
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await setWhen('evStart', local(5));
  await setWhen('evEnd', local(240));
  await form.locator('[data-here]').click();
  await expect(form.locator('[data-picked]')).toBeVisible({ timeout: 20000 });
  // The location check is off unless ticked, and the distance only shows when it's on
  await form.locator('details.ev-more summary').click();
  await expect(form.locator('input[name="evLocCheck"]')).not.toBeChecked();
  await expect(form.locator('.ev-radius-sec')).toBeHidden();
  // SHOTS=<folder>: the switch, for a person to look at (then ticked, to show the distance appears)
  if (process.env.SHOTS) {
    await form.locator('input[name="evLocCheck"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const shot = (n) => host.screenshot({ path: path.join(process.env.SHOTS, `loccheck-${n}-${info.project.name}-${process.env.SHOTS_THEME || 'light'}.png`) });
    await shot('off');
    await form.locator('input[name="evLocCheck"]').check();
    await expect(form.locator('.ev-radius-sec')).toBeVisible();
    await shot('on');
    await form.locator('input[name="evLocCheck"]').uncheck();
  }
  await form.locator('[type="submit"]').click();
  await expect(form.locator('.m-done')).toBeVisible({ timeout: 20000 });
  const code = (await form.locator('.m-code b').textContent()).trim();

  // The server has it off
  const mine = (await (await host.request.get(`${s.api}/api/albums`)).json()).albums.find((a) => a.name === name);
  await expect.poll(async () => (await (await host.request.get(`${s.api}/api/albums/${mine.id}`)).json()).album.locationRequired, { message: 'location check saved as off' }).toBe(false);
  await hostCtx.close();

  // A guest who hasn't allowed location joins with the code: straight into the album, never asked
  const guestCtx = await browser.newContext({ ...info.project.use, permissions: [] });
  const guest = await guestCtx.newPage();
  const asked = [];
  await guest.addInitScript(() => {
    try { localStorage.setItem('momento-dev', '0'); } catch (e) {}
    // (any attempt to read the location is recorded; the browser would show its permission prompt)
    const geo = navigator.geolocation;
    if (geo) for (const fn of ['getCurrentPosition', 'watchPosition']) { const real = geo[fn].bind(geo); geo[fn] = (...a) => { window.__askedWhere = true; return real(...a); }; }
  });
  expect((await guest.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[`${info.project.name}-join`], password: s.password } })).status()).toBe(200);
  await guest.goto(`/albums?join=${code.replace('-', '')}`);
  const album = guest.frameLocator('dialog[open] iframe').first();
  await expect(album.locator('#albumModal[open] #albumTitle')).toHaveText(name);
  asked.push(await guest.evaluate(() => !!window.__askedWhere));
  expect(asked[0], 'the guest was never asked for their location').toBe(false);
  await guestCtx.close();
});
