// The Doughhouse kiosk may be restyled (14-final:2), but a learned skill replays it by its tappable labels, roles
// and names, and the product bridge parses its cart text. This test walks every screen and compares all three with
// fixtures/doughhouse-screens.json, written from the page before the restyle. Run:
//   node --test spikes/kibo-learn/restyle.test.mjs        (needs Chrome, like patterns.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE, KIOSK_FILE, walkScreens } from './kiosk-screens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('the restyled kiosk shows the same tappable labels, roles, names and cart text on every screen', { timeout: 120_000 }, async () => {
  const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const after = await walkScreens();
  assert.deepEqual(after.map((s) => s.name), before.map((s) => s.name));
  for (const [i, s] of after.entries()) {
    assert.deepEqual(s.labels, before[i].labels, `${s.name}: tappable labels`);
    assert.equal(s.tree, before[i].tree, `${s.name}: accessibility tree`);
    assert.equal(s.total, before[i].total, `${s.name}: cart total`);
    assert.deepEqual(s.lines, before[i].lines, `${s.name}: cart lines`);
  }
});

test('the page the product serves is the same file as the spike kiosk', () => {
  const served = path.join(here, '../../public/learned-kiosks/doughhouse/index.html');
  assert.ok(fs.readFileSync(served).equals(fs.readFileSync(KIOSK_FILE)));
});
