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

function runLearner({ maxTurns, fail, calls, defaultCall, maxInputTokens, kiosk = 'kiosk/index.html', trace = false, env = {}, timeout = 120_000 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kibo-learner-'));
  // Each call of the fake gcloud prints a new token: fake-token-1, fake-token-2, …
  fs.writeFileSync(path.join(dir, 'gcloud'), '#!/bin/sh\necho x >> "$GCLOUD_LOG"\necho "fake-token-$(wc -l < "$GCLOUD_LOG" | tr -d \' \')"\n', { mode: 0o755 });
  const log = path.join(dir, 'requests.jsonl');
  const gcloudLog = path.join(dir, 'gcloud.log');
  const traceDir = path.join(dir, 'trace');
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(here, 'fake_vertex.mjs')).href, path.join(here, 'learner.mjs')], {
    cwd: dir, encoding: 'utf8', timeout,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROVIDER: 'gemini', MAX_TURNS: String(maxTurns),
      MAX_INPUT_TOKENS: String(maxInputTokens ?? 2_000_000), GCLOUD_LOG: gcloudLog,
      KIOSK_URL: pathToFileURL(path.join(here, kiosk)).href, FAKE_VERTEX_LOG: log, FAKE_VERTEX_FAIL: fail ?? '',
      FAKE_VERTEX_CALLS: JSON.stringify(calls ?? {}), FAKE_VERTEX_DEFAULT: defaultCall ? JSON.stringify(defaultCall) : '',
      ...(trace ? { TRACE_DIR: traceDir } : {}), ...env },
  });
  const requests = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const statsPath = path.join(dir, 'learn-stats.json');
  const stats = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : null;
  const lastSkillPath = path.join(dir, 'last-skill.json');
  const lastSkill = fs.existsSync(lastSkillPath) ? JSON.parse(fs.readFileSync(lastSkillPath, 'utf8')) : null;
  const skillPath = path.join(dir, 'skill.json');
  const skill = fs.existsSync(skillPath) ? JSON.parse(fs.readFileSync(skillPath, 'utf8')) : null;
  const gcloudCalls = fs.existsSync(gcloudLog) ? fs.readFileSync(gcloudLog, 'utf8').trim().split('\n').length : 0;
  const traceFiles = fs.existsSync(traceDir)
    ? Object.fromEntries(fs.readdirSync(traceDir).map((f) => [f, fs.readFileSync(path.join(traceDir, f))])) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { r, requests, stats, gcloudCalls, traceFiles, lastSkill, skill };
}

// Width of a baseline or progressive JPEG, from its SOF0/SOF2 segment.
function jpegWidth(buf) {
  for (let i = 2; i < buf.length;) {
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) return buf.readUInt16BE(i + 7);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
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

test('I-188: a 401 fetches a new access token and retries once, and cached tokens are counted', () => {
  const { r, requests, stats, gcloudCalls } = runLearner({ maxTurns: 4, fail: '401@2' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /HTTP 401, fetching a new access token/);
  assert.equal(stats.turns, 4);
  assert.equal(requests.length, 5, 'four turns plus one retried request');
  assert.equal(gcloudCalls, 2);
  assert.equal(requests[1].auth, 'Bearer fake-token-1');
  assert.equal(requests[2].auth, 'Bearer fake-token-2', 'the retry carries the new token');
  assert.equal(stats.cachedInputTokens, 4 * 4, 'usageMetadata.cachedContentTokenCount of every answered turn');
});

test('I-188: the access token is fetched again once it is older than TOKEN_MAX_AGE_MS', () => {
  const { r, gcloudCalls } = runLearner({ maxTurns: 3, defaultCall: { name: 'snapshot', args: {} }, env: { TOKEN_MAX_AGE_MS: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(gcloudCalls >= 3, `gcloud was called ${gcloudCalls} times`);
});

test('token budget: between pruning turns each request only adds to the end of the last one', () => {
  const { r, requests } = runLearner({ maxTurns: 13, defaultCall: { name: 'snapshot', args: {} } });
  assert.equal(r.status, 0, r.stderr);
  for (const q of requests.slice(1)) {
    const prev = requests[q.n - 2];
    if (q.n % 4 !== 0) assert.equal(q.prefix, prev.full, `request ${q.n} changed the history it was sent before`);
  }
  assert.notEqual(requests[7].prefix, requests[6].full, 'turn 8 prunes old screens');
  assert.ok(requests[12].length < requests[11].length + 1500, 'old trees are dropped, so requests stop growing by whole screens');
});

const START = '화면을 터치하여 주문을 시작하세요';
const traceCalls = {
  1: { name: 'act', args: { steps: [{ op: 'click', label: START }, { op: 'click', label: '🍽 먹고 갈게요' }] } },
  2: { name: 'record', args: { kind: 'item', data: JSON.stringify([{ name: '마르게리따', category: '피자', optionGroups: [{ name: '사이즈' }, { name: '도우' }] }, { name: '콜라', category: '음료', optionGroups: [] }]) } },
  3: { name: 'records', args: {} },
};

test('trace: TRACE_DIR writes a JSON and a 720 px JPEG per turn, with no prompt or token, and changes no request', () => {
  const plain = runLearner({ maxTurns: 3, calls: traceCalls });
  const traced = runLearner({ maxTurns: 3, calls: traceCalls, trace: true });
  assert.equal(traced.r.status, 0, traced.r.stderr);
  assert.equal(plain.traceFiles, null);
  assert.deepEqual(traced.requests.map((q) => q.full), plain.requests.map((q) => q.full), 'the trace changed what the model was sent');
  const f = traced.traceFiles;
  assert.deepEqual(Object.keys(f).sort(), ['trace.json', 'turn-1.jpg', 'turn-1.json', 'turn-2.jpg', 'turn-2.json', 'turn-3.jpg', 'turn-3.json']);
  for (const n of [1, 2, 3]) assert.equal(jpegWidth(f[`turn-${n}.jpg`]), 720);
  const turn = (n) => JSON.parse(f[`turn-${n}.json`]);
  assert.equal(turn(1).tool, 'act');
  assert.deepEqual(turn(1).args, { steps: [{ op: 'click', label: START }, { op: 'click', label: '🍽 먹고 갈게요' }] });
  assert.equal(turn(1).resultSummary, `tapped ${START} → 🍽 먹고 갈게요`);
  assert.equal(turn(2).resultSummary, 'recorded item 마르게리따, 콜라');
  assert.deepEqual(turn(2).discoveries, { items: 2, optionGroups: 2, categories: 2 });
  assert.equal(turn(3).resultSummary, 'listed 2 items, 0 facts');
  assert.deepEqual([turn(1).inputTokens, turn(1).outputTokens], [10, 1]);
  const header = JSON.parse(f['trace.json']);
  assert.equal(header.kioskId, 'kiosk');
  assert.equal(header.model, 'gemini-3.8-flash');
  assert.ok(header.startedAt && header.endedAt);
  assert.deepEqual(header.gate, { tests: 0, testsPassedForFinish: false, audits: 0, auditOk: null, finished: false });
  const all = Object.entries(f).filter(([k]) => k.endsWith('.json')).map(([, v]) => String(v)).join('\n');
  assert.doesNotMatch(all, /KIBO Kiosk Learner|fake-token|Learn this kiosk|TAPPABLE LABELS/);
});

// Round 3: the gate also asks for the order review when the kiosk shows its order button, and for every option group
// to be used by a passing order. stepper.skill.json predates both, so these tests add the review here.
const stepperSkill = {
  ...JSON.parse(fs.readFileSync(path.join(here, 'fixtures/patterns/stepper.skill.json'), 'utf8')),
  forbiddenLabels: ['카드 결제'],
  review: { open: [{ op: 'openReview', label: '주문하기' }], totalPattern: '합계 ([\\d,]+)원' },
};
const reviewSkill = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/patterns/review.skill.json'), 'utf8'));
const order = (lines, dineOption) => ({ ...(dineOption ? { dineOption } : {}), lines: lines.map(([item, options, qty = 1]) => ({ category: '메뉴', item, options, qty })) });
const testCall = (skill, orders) => ({ name: 'testSkill', args: { skillJson: JSON.stringify(skill), ordersJson: JSON.stringify(orders) } });
const finishCall = (skill) => ({ name: 'finish', args: { skillJson: JSON.stringify(skill) } });
// The fake Vertex logs only hashes of what the learner sends, so these tests read the one line each testSkill prints.

test('pattern 4: orders from several testSkill calls count for the same exact skill', () => {
  const { r, stats } = runLearner({ maxTurns: 3, kiosk: 'fixtures/patterns/stepper.html', calls: {
    1: testCall(stepperSkill, [order([['스콘', []]])]),
    2: testCall(stepperSkill, [order([['라떼', ['HOT']]]), order([['라떼', ['ICED', '적게', '에스프레소 샷', '에스프레소 샷']], ['스콘', [], 2]])]),
    3: finishCall(stepperSkill),
  } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stats.finished, true, r.stdout);
});

test('pattern 4: a changed skill starts the count again, so finish is refused', () => {
  const changed = { ...stepperSkill, notes: ['changed'] };
  const { r, stats } = runLearner({ maxTurns: 3, kiosk: 'fixtures/patterns/stepper.html', calls: {
    1: testCall(stepperSkill, [order([['스콘', []]]), order([['라떼', ['HOT']]])]),
    2: testCall(changed, [order([['스콘', [], 2]])]),
    3: finishCall(changed),
  } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stats.finished, false);
});

test('I-197: finish is refused while an option group has no passing self-test, and accepted once one uses it', () => {
  const three = [order([['스콘', []]]), order([['라떼', ['HOT']]]), order([['라떼', ['ICED', '에스프레소 샷']], ['스콘', [], 2]])];
  const refused = runLearner({ maxTurns: 2, kiosk: 'fixtures/patterns/stepper.html', calls: { 1: testCall(stepperSkill, three), 2: finishCall(stepperSkill) } });
  assert.equal(refused.r.status, 0, refused.r.stderr);
  assert.equal(refused.stats.finished, false, 'three passing orders, but none used 얼음량');
  assert.match(refused.r.stdout, /test #1: PASS PASS PASS .*uncovered=1/);
  const accepted = runLearner({ maxTurns: 3, kiosk: 'fixtures/patterns/stepper.html', calls: {
    1: testCall(stepperSkill, three), 2: testCall(stepperSkill, [order([['라떼', ['ICED', '보통']]])]), 3: finishCall(stepperSkill) } });
  assert.equal(accepted.stats.finished, true, accepted.r.stdout);
});

test("I-195: a self-test whose skill total differs from the kiosk's review total fails, so finish is refused", () => {
  const noCharge = { ...reviewSkill, charges: [] };
  const orders = [order([['커피', ['라지']]], '먹고 가요'), order([['쿠키', []], ['커피', []]], '먹고 가요'), order([['쿠키', []]], '포장해요')];
  const { r, stats } = runLearner({ maxTurns: 2, kiosk: 'fixtures/patterns/review.html', calls: { 1: testCall(noCharge, orders), 2: finishCall(noCharge) } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #1: PASS PASS FAIL/);
  assert.equal(stats.finished, false);
  const fixed = runLearner({ maxTurns: 2, kiosk: 'fixtures/patterns/review.html', calls: { 1: testCall(reviewSkill, orders), 2: finishCall(reviewSkill) } });
  assert.match(fixed.r.stdout, /test #1: PASS PASS PASS/);
  assert.equal(fixed.stats.finished, true, fixed.r.stdout);
});

test('I-195: finish is refused for a skill without review on a kiosk that shows its order button', () => {
  const { review, ...noReview } = stepperSkill;
  const orders = [order([['스콘', []]]), order([['라떼', ['HOT', '바닐라 시럽']]]), order([['라떼', ['ICED', '적게']]])];
  const { r, stats } = runLearner({ maxTurns: 2, kiosk: 'fixtures/patterns/stepper.html', calls: { 1: testCall(noReview, orders), 2: finishCall(noReview) } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #1: PASS PASS PASS .*review=주문하기/);
  assert.equal(stats.finished, false);
});

test('I-202: learn-stats.json records the learner commit and whether spikes/kibo-learn had uncommitted changes', () => {
  const { stats } = runLearner({ maxTurns: 1 });
  assert.match(stats.learner.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof stats.learner.dirty, 'boolean');
});

test('token budget: testSkill, audit and finish reuse the last skill sent when skillJson is left out', () => {
  const orders = [order([['스콘', []]]), order([['라떼', ['HOT', '바닐라 시럽']]]), order([['라떼', ['ICED', '적게']]])];
  const { r, stats } = runLearner({ maxTurns: 4, kiosk: 'fixtures/patterns/stepper.html', calls: {
    1: testCall(stepperSkill, orders.slice(0, 2)),
    2: { name: 'testSkill', args: { ordersJson: JSON.stringify(orders.slice(2)) } },
    3: { name: 'audit', args: {} },
    4: { name: 'finish', args: {} },
  } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #2: PASS\n/, 'the second call counted for the same skill');
  assert.equal(stats.finished, true, r.stdout);
});

test('diagnostics: a failed self-test order is explained in the log, and an unfinished run keeps its last skill', () => {
  const noCharge = { ...reviewSkill, charges: [] };
  const { r, lastSkill } = runLearner({ maxTurns: 1, kiosk: 'fixtures/patterns/review.html',
    calls: { 1: testCall(noCharge, [order([['쿠키', []]], '포장해요')]) } });
  assert.match(r.stdout, /test #1: FAIL[^\n]*\n {4}order 1: the skill's total 1,500원 differs from the kiosk's 1,600원/);
  assert.deepEqual(lastSkill, noCharge);
});

// Round 4 speed: on bk7-bubbletea (round 3) 7 of 76 turns re-sent the whole ~13k-token skill to fix a few fields, about
// 78k of the run's 83k output tokens and a minute of generation each; every copy then stayed in the context.
test('round 4 speed: testSkill, audit and finish take a skillPatch on the last skill, so a fix is not a full resend', () => {
  const wrong = structuredClone(stepperSkill);
  wrong.catalog[1].price = 3100;
  const orders = [order([['스콘', []]]), order([['라떼', ['HOT', '바닐라 시럽']]]), order([['라떼', ['ICED', '적게', '에스프레소 샷']]])];
  const patch = { catalog: [{ name: '스콘', price: 3000 }], notes: null };
  const { r, stats, skill, requests } = runLearner({ maxTurns: 3, kiosk: 'fixtures/patterns/stepper.html', calls: {
    1: testCall(wrong, orders),
    2: { name: 'testSkill', args: { skillPatch: JSON.stringify(patch), ordersJson: JSON.stringify(orders) } },
    3: { name: 'finish', args: {} },
  } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #1: FAIL PASS PASS[^\n]*\n {4}order 1:/);
  assert.match(r.stdout, /test #2: PASS PASS PASS\n/);
  assert.equal(stats.finished, true, r.stdout);
  const { notes, ...want } = stepperSkill;
  assert.deepEqual(skill, want, 'skill.json is the patched skill');
  assert.ok(requests[2].length - requests[1].length < requests[1].length - requests[0].length, 'the patch call added less to the context than the full skill');
});

test('round 4 speed: option groups shared by several items are written once in sharedGroups; skill.json has them expanded', () => {
  const { 0: latte } = stepperSkill.catalog;
  const compact = { ...structuredClone(stepperSkill), sharedGroups: Object.fromEntries(latte.optionGroups.map((g) => [g.name, g])) };
  compact.catalog[0] = { ...latte, optionGroups: latte.optionGroups.map((g) => g.name) };
  compact.catalog.push({ name: '모카', category: '메뉴', price: 4500, soldOut: true, optionGroups: ['온도'] });
  const orders = [order([['스콘', []]]), order([['라떼', ['HOT', '바닐라 시럽']]]), order([['라떼', ['ICED', '적게', '에스프레소 샷']]])];
  const { r, stats, skill } = runLearner({ maxTurns: 2, kiosk: 'fixtures/patterns/stepper.html', calls: { 1: testCall(compact, orders), 2: { name: 'finish', args: {} } } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #1: PASS PASS PASS\n/);
  assert.equal(stats.finished, true, r.stdout);
  assert.equal(skill.sharedGroups, undefined);
  assert.deepEqual(skill.catalog[0], latte);
  assert.deepEqual(skill.catalog[2].optionGroups, [latte.optionGroups[0]]);
});

// bk8-tableorder (round 3, attempt 2): self-test #4 passed 3 of 3 but the gate asked for "review"; with review every
// order failed as reviewUnsafe (the order button leads to sending, not to payment). The gate could not be met.
test('round 4 (bk8): once a review was flagged as sending the order, the gate stops asking for it, and finish is accepted', () => {
  const { review, charges, ...noReview } = reviewSkill;
  const withReview = { ...noReview, review };
  const orders = [order([['커피', ['라지']]], '먹고 가요'), order([['쿠키', []]], '먹고 가요'), order([['커피', ['레귤러']], ['쿠키', []]], '먹고 가요')];
  const { r, stats } = runLearner({ maxTurns: 4, kiosk: 'fixtures/patterns/review.html',
    env: { KIOSK_URL: `${pathToFileURL(path.join(here, 'fixtures/patterns/review.html')).href}?send=1` },
    calls: { 1: testCall(noReview, orders), 2: testCall(withReview, orders), 3: testCall(noReview, orders), 4: { name: 'finish', args: {} } } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test #1: PASS PASS PASS review=주문하기\n/);
  assert.match(r.stdout, /test #2: FAIL FAIL FAIL[^\n]*\n {4}order 1: review: no payment step/);
  assert.match(r.stdout, /test #3: PASS PASS PASS\n/);
  assert.equal(stats.finished, true, r.stdout);
});
