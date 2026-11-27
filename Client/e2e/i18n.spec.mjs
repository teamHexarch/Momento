// The site in another language: a guest who reads Arabic joins the event and opens the upload window. Words the
// page fills in (the host's line, event times, "this photo"), text-box placeholders, and the upload agreement must
// all come out translated, not left in English. Desktop and phone (playwright.config.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json');
const seed = () => JSON.parse(fs.readFileSync(seedFile, 'utf8'));
// English that only ever appears when a translation is missing (names, places and file formats are left out)
const ENGLISH = /\b(Hosted by|Shared with|this photo|these \d+ photos|AM|PM|Open until|Opens|Event|to|Everyone in the album|I took these photos|Tell us what happened|Add a comment)\b/;

test('in Arabic, the album, its upload window and text boxes are translated', async ({ page }, info) => {
  const s = seed(), who = `${info.project.name}-i18n`;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.guests[who], password: s.password } });
  expect(login.status(), 'guest signs in').toBe(200);
  // (SHOTS=<folder> saves screenshots; SHOTS_THEME=dark for the dark theme)
  const theme = process.env.SHOTS_THEME || '';
  const shot = (name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, `i18n-${name}-${info.project.name}-${theme || 'light'}.png`) });
  await page.addInitScript((t) => { try { localStorage.setItem('momento-dev', '0'); localStorage.setItem('momento-lang', 'ar'); if (t) localStorage.setItem('momento-theme', t); } catch (e) {} }, theme);

  await page.goto(`/albums?join=${s.code.replace('-', '')}`);
  const album = page.frameLocator('dialog[open] iframe').first();
  await expect(album.locator('#albumModal[open] #albumTitle')).toHaveText('Smoke test party');
  await expect(album.locator('html')).toHaveAttribute('lang', /^ar/);

  // The line under the title is put together from pieces: each is translated, the host's name stays as it is
  const sub = album.locator('#albumSub');
  await expect(sub).toContainText('Hana Host');
  await expect(sub).not.toHaveText(ENGLISH);
  await shot('album');

  // The upload window: "Momento wants to add this photo to …", the size limits and the agreement
  await album.locator('#albumFiles').setInputFiles(s.photos[who][0]);
  const ask = album.locator('dialog.ev-ask[open]');
  await expect(ask).toBeVisible();
  const asked = await ask.innerText();
  expect(asked, 'upload window').not.toMatch(ENGLISH);
  expect(asked).toMatch(/[؀-ۿ]/);
  await shot('upload');
  await ask.locator('[data-no]').click();

  // The whole album window, the event's times included (tooltips and screen-reader labels too)
  const leftovers = await album.locator('#albumModal').evaluate((root, src) => {
    const re = new RegExp(src);
    const out = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('[aria-hidden="true"], script, style, svg, .emoji-pick, [data-no-i18n]')) continue;
      for (const n of el.childNodes) if (n.nodeType === 3 && re.test(n.nodeValue)) out.push(n.nodeValue.trim());
      for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v && re.test(v)) out.push(`${a}: ${v}`); }
    }
    return out;
  }, ENGLISH.source);
  expect(leftovers, 'English left in the album window').toEqual([]);

  // A text box's placeholder (the Help page's message box)
  await page.goto('/support');
  const message = page.locator('textarea[name="message"]');
  await expect(message).toHaveAttribute('placeholder', /[؀-ۿ]/);
  expect(errors, 'no script errors').toEqual([]);
});
