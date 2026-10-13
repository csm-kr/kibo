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

function runLearner({ maxTurns, fail, calls, maxInputTokens, timeout = 120_000 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kibo-learner-'));
  fs.writeFileSync(path.join(dir, 'gcloud'), '#!/bin/sh\necho fake-token\n', { mode: 0o755 });
  const log = path.join(dir, 'requests.jsonl');
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(here, 'fake_vertex.mjs')).href, path.join(here, 'learner.mjs')], {
    cwd: dir, encoding: 'utf8', timeout,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROVIDER: 'gemini', MAX_TURNS: String(maxTurns),
      MAX_INPUT_TOKENS: String(maxInputTokens ?? 2_000_000),
      KIOSK_URL: pathToFileURL(path.join(here, 'kiosk/index.html')).href, FAKE_VERTEX_LOG: log, FAKE_VERTEX_FAIL: fail ?? '',
      FAKE_VERTEX_CALLS: JSON.stringify(calls ?? {}) },
  });
  const requests = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const statsPath = path.join(dir, 'learn-stats.json');
  const stats = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : null;
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

// 13-blind-kiosks:3: a bk2 run wrote learn-stats.json and then never exited. An audit whose start
// recipe fails leaves its browser open (audit.mjs freshMenu), which kept the process alive.
test('the process exits after an audit whose start recipe fails', () => {
  const broken = { kiosk: 'x', categories: [], uiLabels: [], dineOptions: { eat_in: 'no such button' }, catalog: [],
    recipes: { startOrder: [{ op: 'click', label: '{dineOption}' }], addToCart: [] }, cartTotalPattern: '(\\d+)' };
  const { r, stats } = runLearner({ maxTurns: 3, timeout: 60_000, calls: { 2: { name: 'audit', args: { skillJson: JSON.stringify(broken) } } } });
  assert.equal(r.error?.code, undefined, 'the learner hung and was killed by the test timeout');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stats.turns, 3);
});

test('a dropped connection ends the run with learn-stats.json written and a non-zero exit', () => {
  const { r, stats } = runLearner({ maxTurns: 4, timeout: 60_000, fail: 'throw@2' });
  assert.equal(r.error?.code, undefined, 'the learner hung and was killed by the test timeout');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /learner crashed: fetch failed/);
  assert.equal(stats.turns, 2);
  assert.equal(stats.finished, false);
  assert.equal(stats.error, 'fetch failed');
});

test('the input-token cap stops the run and the process exits', () => {
  const { r, stats } = runLearner({ maxTurns: 10, timeout: 60_000, maxInputTokens: 25 });
  assert.equal(r.error?.code, undefined, 'the learner hung and was killed by the test timeout');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stats.turns, 3, 'three requests of 10 input tokens pass the cap of 25');
});
