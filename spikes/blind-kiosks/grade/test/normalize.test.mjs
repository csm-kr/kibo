import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, sameName, pairItems } from '../lib.mjs';

test('norm drops case, whitespace, punctuation and emoji', () => {
  assert.equal(norm(' 카라멜  팝콘 '), '카라멜팝콘');
  assert.equal(norm('마카롱 (3개입)'), '마카롱3개입');
  assert.equal(norm('🛒 Ham & Cheese Sandwich!'), 'hamcheesesandwich');
  assert.equal(norm('교통카드·이용권'), '교통카드이용권');
  assert.equal(norm(null), '');
});

test('sameName accepts a copied price or count suffix but not another word', () => {
  assert.ok(sameName('라지', '라지 (+4,000원)'));
  assert.ok(sameName('치즈볼 (5개)', '치즈볼'));
  assert.ok(sameName('ICED', 'iced'));
  assert.ok(!sameName('라지', '라지세트'));
  assert.ok(!sameName('M', 'M (기본)'));
  assert.ok(!sameName('콜라', '제로콜라'));
  assert.ok(!sameName('', ''));
});

test('pairItems prefers exact names, matches either language and pairs one to one', () => {
  const keyItems = [{ name: '생수', nameEn: 'Water' }, { name: '생수 500ml' }, { name: '야채김밥', nameEn: 'Veggie Gimbap' }];
  const skillItems = [{ name: '생수 500ml' }, { name: 'Veggie Gimbap' }, { name: '생수' }];
  const pairs = pairItems(keyItems, skillItems);
  assert.deepEqual([...pairs.entries()].sort(), [[0, 2], [1, 0], [2, 1]]);
});
