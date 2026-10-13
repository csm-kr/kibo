// AI-free regression tests for the failure patterns in spikes/blind-kiosks/results/BASELINE.md, on synthetic
// fixtures in fixtures/patterns/ (never the blind test kiosks). Run: node --test spikes/kibo-learn/patterns.test.mjs
// Needs Chrome, like test_audit.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openKiosk, snapshot, act, compactTree } from './driver.mjs';
import { runOrder } from './runner.mjs';
import { audit } from './audit.mjs';
import { lintSkill } from './lint.mjs';
import { orderPlan } from './plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f) => path.join(here, 'fixtures/patterns', f);
const useKiosk = (f) => { process.env.KIOSK_URL = pathToFileURL(fixture(f)).href; };
const skillOf = (f) => JSON.parse(fs.readFileSync(fixture(f), 'utf8'));
const line = (item, options, qty = 1) => ({ category: '메뉴', item, options, qty });

async function onPage(file, steps, fn) {
  useKiosk(file);
  const k = await openKiosk();
  try {
    for (const s of steps) await act(k.page, s);
    return await fn(k);
  } finally { await k.browser.close(); }
}

test('pattern 1: a quantity option is chosen n times on the + of its own row', async () => {
  useKiosk('stepper.html');
  const r = await runOrder(skillOf('stepper.skill.json'), { lines: [line('라떼', ['ICED', '에스프레소 샷', '에스프레소 샷', '바닐라 시럽'])] });
  assert.equal(r.error, undefined);
  assert.equal(r.shownTotal, 4000 + 2 * 500 + 300);
  assert.ok(r.ok);
});

test("pattern 5: a line quantity is raised on that line's own 수량 더하기 when the cart has two lines", async () => {
  useKiosk('stepper.html');
  const r = await runOrder(skillOf('stepper.skill.json'), { lines: [line('스콘', []), line('라떼', ['HOT'], 2)] });
  assert.equal(r.error, undefined);
  assert.equal(r.shownTotal, 3000 + 2 * 4000);
  assert.ok(r.ok);
});

test('patterns 1 and 5: an ambiguous label fails before any click and says how to pick one', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '라떼' }], async ({ page }) => {
    await assert.rejects(act(page, { op: 'click', label: '+' }), (e) => /matches 2/.test(e.message) && /within/.test(e.message)
      && /에스프레소 샷/.test(e.message) && /바닐라 시럽/.test(e.message));
    assert.deepEqual(await page.$$eval('.row .n', (ns) => ns.map((n) => n.textContent)), ['0', '0'], 'nothing was clicked');
  });
});

test('patterns 1 and 5: the snapshot lists repeated labels with the text near each', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '라떼' }], async ({ page, alerts }) => {
    const snap = await snapshot(page, alerts);
    assert.match(snap, /REPEATED LABELS: .*"\+" ×2 near \[에스프레소 샷 \| 바닐라 시럽\]/);
  });
});

test('pattern 8: a toggle with role="radio" and no pointer cursor is a tappable label', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '라떼' }], async ({ page, alerts }) => {
    const labels = JSON.parse((await snapshot(page, alerts)).split('TAPPABLE LABELS: ')[1].split('\n')[0]);
    assert.ok(labels.includes('HOT') && labels.includes('ICED'), labels.join(', '));
  });
});

test('pattern 8: a label that is not on screen names the labels that contain it', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }], async ({ page }) => {
    await assert.rejects(act(page, { op: 'click', label: '라' }), /no tappable label "라".*라떼/);
  });
});

test('pattern 9: a group shown only after ICED replays, and appliesWhen must name an option of another group', async () => {
  useKiosk('stepper.html');
  const skill = skillOf('stepper.skill.json');
  const r = await runOrder(skill, { lines: [line('라떼', ['ICED', '적게'])] });
  assert.equal(r.error, undefined);
  assert.ok(r.ok);
  assert.deepEqual(lintSkill(skill), []);
  skill.catalog[0].optionGroups[1].appliesWhen = '온도=미지근';
  assert.match(lintSkill(skill).join('\n'), /appliesWhen/);
});

test('a native alert is read into the next snapshot', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '라떼' }, { op: 'click', label: '담기' }], async ({ page, alerts }) => {
    assert.match(await snapshot(page, alerts), /^ALERT: 온도를 선택해 주세요\./);
  });
});

test("pattern 6: a set dialog with 다음 between steps replays with chooseOptions and each group's after steps", async () => {
  useKiosk('wizard.html');
  const skill = skillOf('wizard.skill.json');
  const r = await runOrder(skill, { lines: [line('콤보', ['카라멜', '제로콜라']), line('팝콘', [], 2)] });
  assert.equal(r.error, undefined);
  assert.equal(r.shownTotal, 9000 + 500 + 300 + 2 * 5000);
  assert.ok(r.ok);
  assert.deepEqual(lintSkill(skill), []);
  assert.deepEqual(orderPlan(skill, { lines: [line('콤보', ['고소', '콜라'])] }).map((s) => s.label),
    ['시작하기', '콤보', '고소', '다음', '콜라', '다음', '담기']);
});

test('patterns 1 and 6: options named like a navigation control or a stepper button are lint errors', () => {
  const skill = skillOf('wizard.skill.json');
  skill.catalog[1].optionGroups[1].options.push({ name: '다음', priceDelta: 0 }, { name: '+', priceDelta: 0 }, { name: '콜라 더하기', priceDelta: 0 });
  const errors = lintSkill(skill);
  assert.equal(errors.length, 3, errors.join('\n'));
  const q = skillOf('stepper.skill.json');
  delete q.catalog[0].optionGroups[2].select;
  assert.match(lintSkill(q).join('\n'), /quantity group "추가" needs "select"/);
});

test('pattern 3: exploring never taps a payment or checkout control', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }], async ({ page }) => {
    await assert.rejects(act(page, { op: 'click', label: '주문하기' }), /payment or checkout/);
    assert.ok(await page.isVisible('#menu'), 'still on the menu');
  });
});

test('pattern 3: the runner refuses a plan that names a forbidden label before opening the kiosk', async () => {
  useKiosk('stepper.html');
  const skill = skillOf('stepper.skill.json');
  skill.recipes.addToCart.push({ op: 'click', label: '주문하기' });
  const r = await runOrder(skill, { lines: [line('스콘', [])] });
  assert.match(r.error, /forbidden label: 주문하기/);
  assert.equal(r.shownTotal, undefined);
});

test('pattern 3: the audit treats forbiddenLabels as known and never clicks them', async () => {
  useKiosk('stepper.html');
  const r = await audit(skillOf('stepper.skill.json'));
  assert.deepEqual(r.unknownLabels, []);
  assert.ok(r.ok, JSON.stringify(r));
});

test('option groups: the audit opens each item and lists choices on its screen that its option groups lack', async () => {
  useKiosk('stepper.html');
  const skill = skillOf('stepper.skill.json');
  assert.deepEqual((await audit(skill)).missingOptions, {});
  skill.catalog[0].optionGroups[0].options = [{ name: 'ICED', priceDelta: 0 }];
  const r = await audit(skill);
  assert.deepEqual(r.missingOptions, { 라떼: ['HOT'] });
  assert.ok(r.ok, 'informational: a missing option does not fail the audit');
});

test('I-187: an audit whose start recipe fails closes its browser, so the process can exit', () => {
  const broken = { catalog: [], recipes: { startOrder: [{ op: 'click', label: 'no such button' }] } };
  const script = `import { audit } from ${JSON.stringify(pathToFileURL(path.join(here, 'audit.mjs')).href)};
    await audit(${JSON.stringify(broken)}).then(() => console.log('resolved'), (e) => console.log('rejected'));`;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kibo-audit-')), 'run.mjs');
  fs.writeFileSync(file, script);
  const r = spawnSync(process.execPath, [file], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, KIOSK_URL: pathToFileURL(fixture('stepper.html')).href },
  });
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  assert.equal(r.error?.code, undefined, 'the process did not exit on its own: a browser was left open');
  assert.match(r.stdout, /rejected/);
});

test('token budget: compactTree drops decorative lines, keeps every name, and the labels list is untouched', () => {
  const tree = [
    '- img', '- img "🍿"', '- separator', '- link "홈":', '  - /url: "#home"',
    '- text: 팝콘', '- text: 팝콘', '- text: 팝콘', '- button "담기"', '- img "카라멜 팝콘"',
  ].join('\n');
  const out = compactTree(tree + '\nTAPPABLE LABELS: ["담기","홈"]');
  for (const keep of ['- link "홈":', '- text: 팝콘', '- button "담기"', '- img "카라멜 팝콘"', 'TAPPABLE LABELS: ["담기","홈"]']) {
    assert.ok(out.includes(keep), `${keep} was lost:\n${out}`);
  }
  for (const drop of ['- img\n', '🍿', 'separator', '/url:']) assert.ok(!out.includes(drop), `${drop} kept:\n${out}`);
  assert.equal(out.match(/- text: 팝콘/g).length, 1);
  assert.match(out, /\(×3\)/);
});

test('token budget: on a fixture screen every tappable label survives compactTree', async () => {
  await onPage('stepper.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '라떼' }], async ({ page, alerts }) => {
    const snap = await snapshot(page, alerts);
    const labels = JSON.parse(snap.split('TAPPABLE LABELS: ')[1].split('\n')[0]);
    const out = compactTree(snap);
    assert.ok(out.includes(`TAPPABLE LABELS: ${JSON.stringify(labels)}`));
    assert.ok(out.length <= snap.length);
  });
});
