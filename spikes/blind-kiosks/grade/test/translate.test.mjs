import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateOrder, resolveDine, totalCannotSee } from '../lib.mjs';
import { key, skill } from './fixture.mjs';

const order = (lines, extra = {}) => ({ id: 'h', dine: '매장', lines, expectedTotal: 0, ...extra });

test('translates to the skill names, in the skill group order, with counts repeated', () => {
  const t = translateOrder(key, skill(), order([
    { item: '아메리카노', options: { shot: ['shot', 'shot'], temp: ['iced'], ice: ['less'] }, qty: 2 },
  ]));
  assert.ok(t.ok, t.reason);
  assert.deepEqual(t.order, {
    dineOption: '매장에서 먹어요',
    lines: [{ category: '커피', item: '아메리카노 3,000원', options: ['ICED (+500원)', '적게', '샷 추가', '샷 추가'], qty: 2 }],
  });
  assert.deepEqual(t.expectedLines, [['아메리카노 3,000원', '아메리카노']]);
});

test('two groups with the same options map by their titles', () => {
  const t = translateOrder(key, skill(), order([{ item: '투게더 세트', options: { drink2: ['latte'], drink1: ['ame'] }, qty: 1 }]));
  assert.ok(t.ok, t.reason);
  assert.deepEqual(t.order.lines[0].options, ['아메리카노', '카페라떼']);
});

test('a default the skill does not list is left to the kiosk', () => {
  const s = skill();
  s.catalog[0].optionGroups[1].options = [{ name: '적게', priceDelta: 0 }];
  const t = translateOrder(key, s, order([{ item: '아메리카노', options: { temp: ['iced'], ice: ['regular'] }, qty: 1 }]));
  assert.ok(t.ok, t.reason);
  assert.deepEqual(t.order.lines[0].options, ['ICED (+500원)']);
});

test('refuses when the skill lacks the item, the option or a count', () => {
  const s = skill();
  s.catalog.splice(2, 1);
  assert.match(translateOrder(key, s, order([{ item: '투게더 세트', options: {}, qty: 1 }])).reason, /item not in the skill: 투게더 세트/);

  const noLess = skill();
  noLess.catalog[0].optionGroups[1].options = [{ name: '보통', priceDelta: 0 }];
  assert.match(translateOrder(key, noLess, order([{ item: '아메리카노', options: { temp: ['iced'], ice: ['less'] }, qty: 1 }])).reason,
    /option not in the skill: .* › 적게/);

  const toggle = skill();
  toggle.catalog[0].optionGroups[2] = { name: '샷 추가', required: false, min: 0, max: 1, options: [{ name: '샷 추가', priceDelta: 500 }] };
  const t = translateOrder(key, toggle, order([{ item: '아메리카노', options: { temp: ['hot'], shot: ['shot', 'shot'] }, qty: 1 }]));
  assert.equal(t.ok, false);
  assert.match(t.reason, /cannot pick 2 × 에스프레소 샷/);
});

test('a group whose max allows the count may repeat the option without a quantity type', () => {
  const s = skill();
  s.catalog[0].optionGroups[2] = { name: '샷 추가', required: false, min: 0, max: 3, options: [{ name: '샷 추가', priceDelta: 500 }] };
  assert.ok(translateOrder(key, s, order([{ item: '아메리카노', options: { temp: ['hot'], shot: ['shot', 'shot'] }, qty: 1 }])).ok);
});

test('refuses a sold-out mark, a missing recipe and an upsell the skill cannot accept', () => {
  const sold = skill();
  sold.catalog[2].soldOut = true;
  assert.match(translateOrder(key, sold, order([{ item: '투게더 세트', options: {}, qty: 1 }])).reason, /marks 투게더 세트 as sold out/);

  const recipe = skill();
  recipe.catalog[2].recipe = 'addSet';
  assert.match(translateOrder(key, recipe, order([{ item: '투게더 세트', options: {}, qty: 1 }])).reason, /no recipe "addSet"/);

  const up = order([{ item: '쿠키', options: {}, qty: 1, upsell: true }]);
  assert.match(translateOrder(key, skill(), up).reason, /no way to accept the upsell for 쿠키/);
  const withUpsell = skill();
  withUpsell.catalog.push({ name: '쿠키 [특가]', category: '디저트', price: 1500, upsell: true, recipe: 'addToCart', optionGroups: [] });
  assert.equal(translateOrder(key, withUpsell, up).order.lines[0].item, '쿠키 [특가]');
});

test('dine choice: label, pattern, none; refuses a choice the skill does not have', () => {
  const s = skill();
  assert.equal(resolveDine({ dine: '매장' }, s).value, '매장에서 먹어요');
  assert.equal(resolveDine({ patterns: ['take-out', 'syrup-multi'] }, s).value, '포장할게요');
  assert.equal(resolveDine({}, s).value, '매장에서 먹어요');
  assert.equal(resolveDine({}, { dineOptions: {} }).value, undefined);
  const r = resolveDine({ pickup: '상영관 입장 전 수령' }, s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /상영관 입장 전 수령/);
});

test('an answer-key mistake throws instead of grading', () => {
  assert.throws(() => translateOrder(key, skill(), order([{ item: '없는 메뉴', options: {}, qty: 1 }])), /unknown item/);
  assert.throws(() => translateOrder(key, skill(), order([{ item: '아메리카노', options: { temp: ['warm'] }, qty: 1 }])), /no option warm/);
});

test('totalCannotSee lists choices a wrong pick would not change the total for', () => {
  const o = order([{ item: '아메리카노', options: { temp: ['iced'], ice: ['less'], shot: ['shot'] }, qty: 1 }]);
  assert.deepEqual(totalCannotSee(key, o), ['아메리카노 › 적게']);
});
