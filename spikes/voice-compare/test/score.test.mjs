import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorRate, termHits, scoreClip } from '../lib/score.mjs';

test('Korean CER ignores spaces/punctuation and number style', () => {
  assert.equal(errorRate('ko', '치즈버거 세트 두 개요.', '치즈버거세트 2개요'), 0);
  assert.equal(errorRate('ko', '치킨너겟 하나 주세요.', '치킨너겟 1개 주세요'), 0);
  assert.equal(errorRate('ko', '제로콜라', '제로 콜라!'), 0);
  assert.ok(Math.abs(errorRate('ko', '제로콜라', '제로코라') - 0.25) < 1e-9);
  assert.equal(errorRate('ko', '네.', ''), 1);
});

test('English WER lowercases, drops punctuation, maps digits', () => {
  assert.equal(errorRate('en', 'Two cheeseburger sets.', '2 Cheeseburger sets'), 0);
  assert.equal(errorRate('en', "I'll pay now.", 'ill pay now'), 0);
  assert.ok(Math.abs(errorRate('en', 'Make both fries large.', 'Make both fry large') - 0.25) < 1e-9);
});

test('Korean key terms accept listed variants', () => {
  const terms = [['제로콜라'], ['두개', '2개'], ['피클빼']];
  assert.deepEqual(termHits('ko', terms, '제로 콜라 2개, 피클 빼고'), [true, true, true]);
  assert.deepEqual(termHits('ko', terms, '제로코라 두 개'), [false, true, false]);
});

test('English key terms match joined words and plurals, not substrings', () => {
  const terms = [['zerocola', 'zerocoke'], ['icedcoffee'], ['a']];
  assert.deepEqual(termHits('en', terms, 'Zero Coke and three iced coffees'), [true, true, false]);
  assert.deepEqual(termHits('en', [['halal']], 'Is this hallal?'), [false]);
  assert.deepEqual(termHits('en', [['cheeseburger']], 'two cheese burgers'), [true]);
});

test('scoreClip reports missed terms', () => {
  const s = scoreClip({ lang: 'ko', text: '할랄이에요?', terms: [['할랄']] }, '하라리에요?');
  assert.equal(s.termHits, 0);
  assert.deepEqual(s.missedTerms, ['할랄']);
});
