import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCatalog, notLearnedOrders } from '../lib.mjs';
import { key } from './fixture.mjs';

test('no skill: catalog recall 0 and every holdout order counts as not learned', () => {
  const c = gradeCatalog(key, {});
  assert.equal(c.items.matched, 0);
  assert.equal(c.items.recall, 0);

  const k = { ...key, holdoutOrders: [{ id: 'h1', lines: [], expectedTotal: 4500 }, { id: 'h2', lines: [], expectedTotal: 0 }] };
  const o = notLearnedOrders(k);
  assert.deepEqual([o.total, o.correct, o.safeRefusal, o.unsafe, o.notLearned, o.linesChecked], [2, 0, 0, 0, 2, 0]);
  assert.deepEqual(o.results.map((r) => [r.id, r.outcome, r.reason]), [['h1', 'notLearned', 'no skill'], ['h2', 'notLearned', 'no skill']]);
});
