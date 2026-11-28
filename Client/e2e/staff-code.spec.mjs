// The staff team (Server: services/adminStaffService.js): each person opens the link emailed to them, chooses their own
// code on /set-code, then signs in to the shared staff account and unlocks /review with that code, which says who
// they are. Desktop and phone (playwright.config.mjs); each has its own person in e2e/server.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const seed = () => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.run', 'seed.json'), 'utf8'));

test('a staff member chooses their own code from the emailed link, then unlocks the review page with it', async ({ page }, info) => {
  const s = seed(), me = s.staff[info.project.name];
  const code = info.project.name === 'desktop' ? 'DESK42' : 'PHON37';
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // (the local sample-data preview stays off, so the real API answers)
  await page.addInitScript(() => { try { localStorage.setItem('momento-dev', '0'); } catch (e) {} });

  // ---- The emailed link: their name, two sets of boxes, and the key gone from the address bar ----
  await page.goto(`/set-code#${me.token}`);
  await expect(page.locator('#hello')).toHaveText(`Hi ${me.name.split(' ')[0]}, choose your staff code`);
  expect(new URL(page.url()).hash, 'the key is out of the address bar').toBe('');
  // Two different codes: refused, nothing saved
  await page.locator('#first input').first().click();
  await page.keyboard.type(code);
  await page.keyboard.type('ZZZZ99');
  await page.locator('#go').click();
  await expect(page.locator('#err')).toHaveText('The two codes aren’t the same. Type it again.');
  // The same code twice: saved
  await page.locator('#again input').first().click();
  await page.keyboard.type(code.toLowerCase());
  await page.locator('#go').click();
  await expect(page.locator('#done')).toBeVisible();
  await expect(page.locator('#done h1')).toContainText('Your code is saved');

  // The link works once (a fresh page load: only the # would change otherwise)
  await page.goto('about:blank');
  await page.goto(`/set-code#${me.token}`);
  await expect(page.locator('#gone')).toBeVisible();

  // ---- The shared staff account: the code says who it is ----
  const login = await page.request.post(`${s.api}/api/auth/login`, { data: { email: s.staffAccount, password: s.password } });
  expect(login.status(), 'the staff account signs in').toBe(200);
  await page.goto('/review');
  const gate = page.locator('#gate[open]');
  await expect(gate).toBeVisible();
  await expect(gate.locator('#gateEmail')).toHaveCount(0);   // no email to type: the code alone
  await gate.locator('#codeBoxes input').first().click();
  await page.keyboard.type('WRONG1');
  await expect(gate.locator('#gateErr')).toHaveText('That code isn’t right. Check it and try again.');
  await page.waitForTimeout(600);
  await gate.locator('#codeBoxes input').first().click();
  await page.keyboard.type(code);
  await expect(page.locator('#gate')).not.toHaveAttribute('open');
  await expect(page.getByText(`you are reviewing as ${me.name}`)).toBeVisible();
  const session = await (await page.request.get(`${s.api}/api/admin/session`)).json();
  expect([session.verified, session.staff?.name]).toEqual([true, me.name]);
  expect(errors, 'no script errors on the page').toEqual([]);
});
