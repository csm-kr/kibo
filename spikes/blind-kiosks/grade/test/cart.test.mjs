// Grader v2 reads the kiosk's cart panel, opening a closed drawer first (I-183). Opens Chrome on a local fixture; no AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gradeKiosk } from '../grade.mjs';
import { runAndReadCart } from '../run.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drawer');
const files = { skillPath: path.join(DIR, 'skill.json'), keyPath: path.join(DIR, 'answer-key.json'), appPath: path.join(DIR, 'index.html') };

test('I-183: a closed drawer cart is opened and read, so its lines decide (the tabs are list items, not cart lines)', async () => {
  const g = await gradeKiosk({ kioskId: 'drawer-fixture', label: 'test', ...files });
  const [h1, h2] = g.orders.results;
  assert.equal(g.grader, 2);
  assert.equal(h1.outcome, 'correct');
  assert.equal(h1.linesChecked, true);
  assert.equal(h1.cartSource, 'opened', 'the grader taps 장바구니 even though the skill lists it in forbiddenLabels');
  // Same price, wrong tile: the total matches, only the opened cart shows the mistake.
  assert.equal(h2.kioskTotal, 6000);
  assert.equal(h2.outcome, 'unsafe');
  assert.match(h2.reason, /lacks 바다 엽서/);
  assert.equal(g.orders.linesChecked, 2);
});

test('a cart panel already on screen is read without tapping anything', async () => {
  process.env.KIOSK_URL = `${pathToFileURL(files.appPath).href}?open=1`;
  const skill = JSON.parse(fs.readFileSync(files.skillPath, 'utf8'));
  const run = await runAndReadCart(skill, { lines: [{ category: '기념품', item: '펭귄 머리띠', options: [], qty: 1 }] }, ['고래 키링', '바다 엽서', '펭귄 머리띠']);
  assert.equal(run.shownTotal, 9000);
  assert.equal(run.cartSource, 'visible');
  assert.equal(run.cartHead, '장바구니');
  assert.match(run.cart, /펭귄 머리띠 ×1/);
  assert.doesNotMatch(run.cart, /고래 키링/, 'the menu tiles are not the cart');
});
