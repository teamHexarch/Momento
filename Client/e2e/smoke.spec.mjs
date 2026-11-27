// The core loop, as a guest sees it: open the event's join link, get into the album, upload a photo, see it in the
// album, react to it. Desktop and phone (playwright.config.mjs). The API and the event come from e2e/server.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));

test('a guest joins with the link, uploads a photo, sees it and reacts', async ({ page }, info) => {
  const s = seed(), who = info.project.name;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Signed in already (sign-in has its own captcha and email checks); the local sample-data preview stays off
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[who], password: s.password } });
  expect(login.status(), 'guest signs in').toBe(200);
  await page.addInitScript(() => { try { localStorage.setItem('momento-dev', '0'); } catch (e) {} });

  // 1. The link the host shares (albums?join=CODE): it joins and opens the album
  await page.goto(`/albums?join=${s.code.replace('-', '')}`);
  const album = page.frameLocator('dialog[open] iframe').first();
  await expect(album.locator('#albumModal[open] #albumTitle')).toHaveText('Smoke test party');

  // 2. Upload a photo: pick it, then confirm in the upload window
  await album.locator('#albumFiles').setInputFiles(s.photos[who]);
  await album.locator('.ev-ask [data-yes]').click();

  // 3. It appears in the album (the photo check runs on the server first)
  const tile = album.locator('#thumbs .ab-tile').first();
  await expect(tile).toBeVisible({ timeout: 45000 });

  // 4. Open it and react
  await tile.click();
  await expect(album.locator('#viewer[open]')).toBeVisible();
  await album.locator('#vwReact').click();
  const emoji = album.locator('#vwEmoji button.rx').first();
  const chosen = await emoji.getAttribute('data-e');
  await emoji.click();

  // The reaction is saved on the server, not just shown on the page
  await expect.poll(async () => {
    const { photos = [] } = await (await page.request.get(`${s.api}/api/albums/${s.albumId}`)).json();
    return photos.some((p) => p.reaction === chosen);   // (reaction: this guest's own)
  }, { message: 'reaction saved', timeout: 15000 }).toBe(true);

  expect(errors, 'no script errors on the page').toEqual([]);
});
