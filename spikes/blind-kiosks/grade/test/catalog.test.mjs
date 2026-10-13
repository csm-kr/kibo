import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCatalog, isConditional, skillGroupHasCondition, compareItemOptions, keyGroupsOf } from '../lib.mjs';
import { key, skill } from './fixture.mjs';

test('items: recall and precision by normalized name, then price, category and sold out', () => {
  const c = gradeCatalog(key, skill());
  assert.deepEqual(c.items, { key: 3, skill: 4, matched: 3, recall: 1, precision: 0.75, missing: [], extra: ['쿠키'] });
  assert.deepEqual([c.price, c.category, c.soldOut], [{ correct: 3, of: 3 }, { correct: 3, of: 3 }, { correct: 3, of: 3 }]);
});

test('options: labels and deltas, rules, quantity and conditional groups', () => {
  const c = gradeCatalog(key, skill());
  assert.equal(c.options.itemsExact, 2);
  assert.equal(c.options.items, 2);
  assert.equal(c.options.quantityRecognized, 1);
  assert.equal(c.options.conditionalGroups, 1);
  assert.equal(c.options.conditionalFound, 1);
  assert.equal(c.options.groupRulesCorrect, c.options.groupsFound);

  const s = skill();
  delete s.catalog[0].optionGroups[1].visibleWhen;
  s.catalog[0].optionGroups[2] = { name: '샷 추가', required: false, min: 0, max: 3, options: [{ name: '샷 추가', priceDelta: 500 }] };
  s.catalog[0].optionGroups[0].options[1].priceDelta = 300;
  const worse = gradeCatalog(key, s);
  assert.equal(worse.options.conditionalFound, 0);
  assert.equal(worse.options.quantityRecognized, 0);
  assert.equal(worse.options.itemsExact, 1);
  assert.deepEqual(worse.perItem[0].options.missing, ['ICED 500']);
  assert.deepEqual(worse.perItem[0].options.extra, ['ICED (+500원) 300']);
});

test('openable options skip a conditional group and the skill group mapped to it', () => {
  const s = skill();
  s.catalog[0].optionGroups.splice(1, 1);
  const kGroups = keyGroupsOf(key, key.items[0]);
  assert.equal(compareItemOptions(kGroups, s.catalog[0].optionGroups).exact, false);
  assert.equal(compareItemOptions(kGroups, s.catalog[0].optionGroups, { skip: (_, cond) => cond }).exact, true);
  assert.equal(gradeCatalog(key, s).perItem[0].options.openableExact, true);
});

test('a group is conditional only when its condition names another group of the item', () => {
  assert.ok(isConditional({ id: 'ice', appliesWhen: 'temperature option (temp / tempUp) is "iced"' }, ['temp', 'ice']));
  assert.ok(!isConditional({ id: 'ice', appliesWhen: 'temp is iced' }, ['tempUp', 'ice']));
  assert.ok(!isConditional({ id: 'toppings', appliesWhen: 'every 라멘 item ordered alone' }, ['firmness', 'toppings']));
  assert.ok(!isConditional({ id: 'x', appliesWhen: null }, ['y']));
});

test('a skill group counts as conditional through any non-empty condition field', () => {
  assert.ok(skillGroupHasCondition({ name: '얼음', appliesWhen: 'ICED' }));
  assert.ok(skillGroupHasCondition({ name: '얼음', showIf: { group: '온도', option: 'ICED' } }));
  assert.ok(!skillGroupHasCondition({ name: '얼음', condition: '' }));
  assert.ok(!skillGroupHasCondition({ name: '얼음', required: true, min: 1, max: 1, options: [] }));
});
