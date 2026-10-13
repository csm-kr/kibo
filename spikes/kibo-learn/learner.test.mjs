// Runs the real learner loop against a fake Vertex AI (fake_vertex.mjs) and a fake gcloud, no network.
// Run: node --test spikes/kibo-learn/learner.test.mjs  (needs Chrome, like test_audit.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function runLearner({ maxTurns, fail }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kibo-learner-'));
  fs.writeFileSync(path.join(dir, 'gcloud'), '#!/bin/sh\necho fake-token\n', { mode: 0o755 });
  const log = path.join(dir, 'requests.jsonl');
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(here, 'fake_vertex.mjs')).href, path.join(here, 'learner.mjs')], {
    cwd: dir, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROVIDER: 'gemini', MAX_TURNS: String(maxTurns),
      KIOSK_URL: pathToFileURL(path.join(here, 'kiosk/index.html')).href, FAKE_VERTEX_LOG: log, FAKE_VERTEX_FAIL: fail ?? '' },
  });
  const requests = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const stats = JSON.parse(fs.readFileSync(path.join(dir, 'learn-stats.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { r, requests, stats };
}

test('I-185: the "Stop exploring" nudge never makes Vertex refuse the next request', () => {
  const { r, requests, stats } = runLearner({ maxTurns: 82 });
  assert.equal(r.status, 0, r.stderr);
  const nudged = requests.filter((q) => q.nudge);
  assert.deepEqual(nudged.map((q) => q.n), [81], 'the turn-80 nudge is sent with request 81');
  for (const q of requests) {
    assert.equal(q.role, 'user', `request ${q.n} ends with a ${q.role} turn`);
    assert.ok(!(q.kinds.includes('functionResponse') && q.kinds.lastIndexOf('text') > q.kinds.indexOf('functionResponse')),
      `request ${q.n}: a text part follows the function responses (${q.kinds.join(',')})`);
  }
  assert.ok(nudged[0].kinds.includes('functionResponse') && nudged[0].kinds.includes('text'),
    'the nudge stays in the same user turn as the function responses');
  assert.equal(stats.turns, 82, `learner stopped at turn ${stats.turns}: ${r.stderr}`);
});

test('a 503 is retried once after a short wait, and the run goes on', () => {
  const { r, requests, stats } = runLearner({ maxTurns: 4, fail: '503@2' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stats.turns, 4);
  assert.equal(requests.length, 5, 'four turns plus one retried request');
  assert.match(r.stderr, /HTTP 503, retrying once/);
});

test('a 400 is not retried: the run stops on it', () => {
  const { r, requests, stats } = runLearner({ maxTurns: 4, fail: '400@2' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(requests.length, 2);
  assert.equal(stats.turns, 2);
  assert.match(r.stderr, /Bad request/);
});
