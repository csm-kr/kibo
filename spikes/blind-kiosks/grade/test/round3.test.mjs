// Round 3 (spikes/blind-kiosks/ROUND3.md): the grader replays a skill the way the round-3 runner does: it answers the
// skill's interrupts (I-194) and, when the skill declares its order review, takes the kiosk's total there (I-195). The
// plain grader-v2 outcome from the menu cart's total is kept beside it. Opens Chrome on local fixtures; no AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gradeKiosk } from '../grade.mjs';
import { runAndReadCart } from '../run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PATTERNS = path.resolve(HERE, '../../../kibo-learn/fixtures/patterns');
const files = { keyPath: path.join(HERE, 'fixtures', 'review', 'answer-key.json'), appPath: path.join(PATTERNS, 'review.html') };
const reviewSkill = () => JSON.parse(fs.readFileSync(path.join(PATTERNS, 'review.skill.json'), 'utf8'));

function gradeWith(skill) {
  const dir = fs.mkdtempSync(path.join(HERE, 'fixtures', 'review', 'tmp-'));
  const skillPath = path.join(dir, 'skill.json');
  fs.writeFileSync(skillPath, JSON.stringify(skill));
  return gradeKiosk({ kioskId: 'review-fixture', label: 'test', skillPath, ...files }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('I-195: with a declared review the kiosk total is read there, so the take-out charge is seen; the cart-only outcome is kept', async () => {
  const g = await gradeWith(reviewSkill());
  const [h1, h2] = g.orders.results;
  assert.deepEqual([h1.outcome, h1.totalSource, h1.cartTotal, h1.kioskTotal, h1.skillPredicts], ['correct', 'review', 3500, 3600, 3600]);
  assert.equal(h1.cartOnlyOutcome, 'unsafe', 'grader v2 read the menu cart, 100원 short');
  assert.equal(h1.linesChecked, true);
  assert.deepEqual([h2.outcome, h2.kioskTotal, h2.cartOnlyOutcome], ['correct', 1500, 'correct']);
  assert.deepEqual([g.orders.correct, g.orders.cartOnly.correct, g.orders.cartOnly.unsafe], [2, 1, 1]);
});

test('I-195: a skill without a review is graded on the cart total, as grader v2 did', async () => {
  const { review, charges, ...skill } = reviewSkill();
  const g = await gradeWith(skill);
  const [h1] = g.orders.results;
  assert.deepEqual([h1.outcome, h1.totalSource, h1.kioskTotal, h1.cartOnlyOutcome], ['unsafe', 'cart', 3500, 'unsafe']);
});

test("I-194: the grader's replay answers the skill's interrupts like the runner", async () => {
  process.env.KIOSK_URL = pathToFileURL(path.join(PATTERNS, 'interrupt.html')).href;
  const skill = JSON.parse(fs.readFileSync(path.join(PATTERNS, 'interrupt.skill.json'), 'utf8'));
  const run = await runAndReadCart(skill, { lines: [{ category: '메뉴', item: '라떼', options: ['ICED', '라지'], qty: 1 }, { category: '메뉴', item: '머핀', options: [], qty: 1 }] }, ['라떼', '머핀']);
  assert.equal(run.error, undefined);
  assert.equal(run.shownTotal, 7700);
  assert.ok(run.interruptsAnswered.length >= 1);
});
