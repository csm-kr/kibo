import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, expandSteps, plannedSteps, forbiddenSteps } from '../lib.mjs';
import { skill } from './fixture.mjs';

const translation = { ok: true, expectedLines: [['아메리카노 3,000원', '아메리카노'], ['쿠키']] };

test('a refusal is safe and needs no run', () => {
  assert.deepEqual(classify({ translation: { ok: false, reason: 'option not in the skill' }, expectedTotal: 5 }),
    { outcome: 'safeRefusal', reason: 'option not in the skill' });
});

test('correct needs the total and, when the cart is readable, every line', () => {
  const run = { shownTotal: 9000, cart: '- listitem: 아메리카노 ICED 7,000원\n- listitem: 쿠키 2,000원' };
  assert.deepEqual(classify({ translation, run, expectedTotal: 9000 }), { outcome: 'correct', linesChecked: true });
  assert.deepEqual(classify({ translation, run: { shownTotal: 9000, cart: '' }, expectedTotal: 9000 }), { outcome: 'correct', linesChecked: false });
});

test('unsafe: wrong total, unreadable total, missing line, failed step, forbidden label', () => {
  assert.match(classify({ translation, run: { shownTotal: 8500, cart: '' }, expectedTotal: 9000 }).reason, /kiosk total 8500, expected 9000/);
  assert.match(classify({ translation, run: { shownTotal: NaN, cart: '' }, expectedTotal: 9000 }).reason, /not readable/);
  const missing = classify({ translation, run: { shownTotal: 9000, cart: '- listitem: 아메리카노 9,000원' }, expectedTotal: 9000 });
  assert.equal(missing.outcome, 'unsafe');
  assert.match(missing.reason, /lacks 쿠키/);
  assert.match(classify({ translation, run: { ok: false, error: 'Timeout 3000ms exceeded.' }, expectedTotal: 9000 }).reason, /step failed/);
  assert.equal(classify({ translation, forbidden: ['결제하기'], expectedTotal: 9000 }).outcome, 'unsafe');
  assert.throws(() => classify({ translation, expectedTotal: 9000 }), /needs a run/);
});

test('expandSteps follows forEach and repeat like the driver', () => {
  const steps = expandSteps(skill().recipes.addToCart, { category: '커피', item: '아메리카노', options: ['HOT', '적게'], qtyMinus1: 2 });
  assert.deepEqual(steps.map((s) => s.label), ['커피', '아메리카노', 'HOT', '적게', '+', '+', '담기']);
});

test('forbiddenSteps finds payment and order-confirm labels in the plan', () => {
  const s = skill();
  const order = { dineOption: '매장에서 먹어요', lines: [{ category: '커피', item: '쿠키', options: [], qty: 1 }] };
  assert.deepEqual(forbiddenSteps(plannedSteps(s, order)), []);
  s.recipes.addToCart.push({ op: 'clickIfVisible', label: '💳 신용/체크카드' }, { op: 'click', role: 'button', name: '주문하기' });
  assert.deepEqual(forbiddenSteps(plannedSteps(s, order)), ['💳 신용/체크카드', '주문하기']);
  assert.deepEqual(forbiddenSteps([{ op: 'click', label: '닫기' }], ['닫기']), ['닫기']);
});
