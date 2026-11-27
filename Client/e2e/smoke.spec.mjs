// The core loop, as a guest sees it: open the event's join link, get into the album, upload photos, see them in the
// album, react. Plus what venue Wi-Fi does to uploads: requests that keep failing, and the connection dropping
// mid-upload. Desktop and phone (playwright.config.mjs). The API and the event come from e2e/server.mjs; each test
// has its own guest and photos there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));

// Signed in as this test's guest (sign-in has its own captcha and email checks), into the album with the host's link
async function joinAsGuest(page, s, guest) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[guest], password: s.password } });
  expect(login.status(), 'guest signs in').toBe(200);
  // (the local sample-data preview stays off; SHOTS_THEME=dark for screenshots of the dark theme)
  await page.addInitScript((theme) => { try { localStorage.setItem('momento-dev', '0'); if (theme) localStorage.setItem('momento-theme', theme); } catch (e) {} }, process.env.SHOTS_THEME || '');
  await page.goto(`/albums?join=${s.code.replace('-', '')}`);
  const album = page.frameLocator('dialog[open] iframe').first();
  await expect(album.locator('#albumModal[open] #albumTitle')).toHaveText('Smoke test party');
  return { album, errors };
}
// This guest's photos in the album, according to the server
const myPhotos = async (page, s) => ((await (await page.request.get(`${s.api}/api/albums/${s.albumId}`)).json()).photos || []).filter((p) => p.mine);
async function chooseAndConfirm(album, files) {
  await album.locator('#albumFiles').setInputFiles(files);
  await album.locator('.ev-ask [data-yes]').click();
}

test('a guest joins with the link, uploads a photo, sees it and reacts', async ({ page }, info) => {
  const s = seed(), who = info.project.name;
  const { album, errors } = await joinAsGuest(page, s, who);

  await chooseAndConfirm(album, s.photos[who][0]);
  // It appears in the album (the photo check runs on the server first)
  const tile = album.locator('#thumbs .ab-tile').first();
  await expect(tile).toBeVisible({ timeout: 45000 });

  // Open it and react
  await tile.click();
  await expect(album.locator('#viewer[open]')).toBeVisible();
  await album.locator('#vwReact').click();
  const emoji = album.locator('#vwEmoji button.rx').first();
  const chosen = await emoji.getAttribute('data-e');
  await emoji.click();
  // Saved on the server, not just shown on the page
  await expect.poll(async () => (await myPhotos(page, s)).some((p) => p.reaction === chosen), { message: 'reaction saved', timeout: 15000 }).toBe(true);

  expect(errors, 'no script errors on the page').toEqual([]);
});

test('uploads that keep failing are kept, listed, and sent with "Retry the rest"', async ({ page }, info) => {
  const s = seed(), who = `${info.project.name}-retry`;
  const { album, errors } = await joinAsGuest(page, s, who);
  const files = s.photos[who].slice(0, 3);

  // Every upload fails, as on a connection that keeps dropping
  let broken = true;
  await page.route('**/api/albums/*/photos', (route) => (broken && route.request().method() === 'POST' ? route.abort('connectionfailed') : route.fallback()));
  await chooseAndConfirm(album, files);

  // Nothing lost: the page says which photos didn't go up, offers to send them again, and never asks for a refresh
  const retry = album.locator('#albumNote .note-retry');
  await expect(retry).toBeVisible({ timeout: 75000 });
  await expect(retry).toHaveText('Retry the rest (3)');
  for (const f of files) await expect(album.locator('#albumNote')).toContainText(path.basename(f).slice(0, 12));
  await expect(album.locator('#albumNote')).not.toContainText(/refresh/i);
  expect(await myPhotos(page, s)).toHaveLength(0);
  // SHOTS=<folder>: a picture of this for a person to look at
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `retry-${info.project.name}-${process.env.SHOTS_THEME || 'light'}.png`) });

  // The connection is back: one tap sends exactly those photos (no question, no choosing them again)
  broken = false;
  await retry.click();
  await expect.poll(async () => (await myPhotos(page, s)).length, { message: 'all 3 photos arrived once', timeout: 45000 }).toBe(3);
  await expect(album.locator('.ev-ask')).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  expect(errors, 'no script errors on the page').toEqual([]);
});

test('an upload that loses its connection waits, then finishes by itself', async ({ page, context }, info) => {
  const s = seed(), who = `${info.project.name}-offline`;
  const { album, errors } = await joinAsGuest(page, s, who);
  const files = s.photos[who].slice(0, 4);

  // The connection drops as the upload starts, and comes back a few seconds later
  await context.setOffline(true);
  await chooseAndConfirm(album, files);
  await expect(album.locator('#uploadLabel')).toContainText('Waiting for a connection', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await context.setOffline(false);

  await expect.poll(async () => (await myPhotos(page, s)).length, { message: 'all 4 photos arrived once', timeout: 60000 }).toBe(4);
  await expect(album.locator('#albumNote .note-retry')).toHaveCount(0);
  expect(errors, 'no script errors on the page').toEqual([]);
});
