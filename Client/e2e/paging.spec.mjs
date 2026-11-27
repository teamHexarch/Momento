// Big albums (audit F4): the album window asks for its photos a page at a time and, while it's open, only for what
// changed. The page size is 200 on the site; here it's rewritten to 2 so a handful of photos makes several pages.
// Desktop and phone (playwright.config.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));

test('a big album loads in pages, then picks up new and deleted photos without reloading everything', async ({ page }, info) => {
  const s = seed(), who = `${info.project.name}-paging`;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[who], password: s.password } });
  expect(login.status(), 'guest signs in').toBe(200);
  const headers = { Origin: s.site };
  const join = await page.request.post(`${s.api}/api/albums/join`, { headers, data: { code: s.code } });
  expect(join.ok(), 'guest joins the event').toBe(true);
  // (the test server needs the upload agreement on record, as the website sends it when the box is ticked)
  const { album: details } = await (await page.request.get(`${s.api}/api/albums/${s.albumId}`)).json();
  expect((await page.request.post(`${s.api}/api/albums/${s.albumId}/consent`, { headers, data: { termsVersion: details.termsVersion } })).ok(), 'agreement recorded').toBe(true);
  const everything = async () => ((await (await page.request.get(`${s.api}/api/albums/${s.albumId}`)).json()).photos || []).map((p) => p.id);
  // Uploads one photo and waits for it to be in the album (201: published at once; 202: still being checked)
  const upload = async (file) => {
    const before = new Set(await everything());
    const r = await page.request.post(`${s.api}/api/albums/${s.albumId}/photos`, { headers, multipart: { photos: { name: path.basename(file), mimeType: 'image/jpeg', buffer: fs.readFileSync(file) } } });
    expect([201, 202], 'photo uploads').toContain(r.status());
    let id;
    await expect.poll(async () => (id = (await everything()).find((x) => !before.has(x))), { timeout: 15000 }).toBeTruthy();
    return id;
  };
  // Three photos before the album opens (other tests' guests may have added more: the count comes from the server)
  for (const f of s.photos[who].slice(0, 3)) await upload(f);

  // Every request the album window makes for its photos, with pages of 2 instead of 200
  const asked = [];
  await page.route(/\/api\/albums\/[0-9a-f]{24}(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.fallback();
    if (url.searchParams.get('limit') === '200') url.searchParams.set('limit', '2');
    asked.push(url.search);
    return route.fallback({ url: url.toString() });
  });
  await page.addInitScript(() => { try { localStorage.setItem('momento-dev', '0'); } catch (e) {} });
  await page.goto(`/albums?album=${s.albumId}`);
  const album = page.locator('#albumModal[open]');
  await expect(album.locator('#albumTitle')).toHaveText('Smoke test party');

  // All of them arrive, a page at a time
  const all = await everything();
  expect(all.length).toBeGreaterThan(2);
  await expect(album.locator('.ab-tile')).toHaveCount(all.length);
  expect(asked.filter((q) => /limit=2\b/.test(q) && /before=/.test(q)).length, 'later pages asked for').toBeGreaterThanOrEqual(Math.ceil(all.length / 2) - 1);
  const tiles = await album.locator('.ab-tile').evaluateAll((els) => els.map((e) => e.dataset.id));
  expect(new Set(tiles).size, 'no photo twice').toBe(tiles.length);
  expect([...tiles].sort()).toEqual([...all].sort());

  // A new photo shows up by itself, from a "what changed" request (not the whole album again)
  asked.length = 0;
  const fresh = await upload(s.photos[who][3]);
  await expect(album.locator(`.ab-tile[data-id="${fresh}"]`)).toBeVisible({ timeout: 15000 });
  expect(asked.some((q) => /since=/.test(q)), 'asked for changes only').toBe(true);
  expect(asked.filter((q) => /limit=2\b/.test(q)), 'no full reload').toEqual([]);
  await expect(album.locator('.ab-tile')).toHaveCount(all.length + 1);

  // A deleted photo goes away the same way
  const del = await page.request.delete(`${s.api}/api/photos/${fresh}`, { headers });
  expect(del.ok(), 'photo deleted').toBe(true);
  await expect(album.locator(`.ab-tile[data-id="${fresh}"]`)).toHaveCount(0, { timeout: 15000 });
  await expect(album.locator('.ab-tile')).toHaveCount(all.length);
  expect(errors, 'no script errors').toEqual([]);
});
