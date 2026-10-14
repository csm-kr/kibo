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
import { audit, resetAuditMemo } from './audit.mjs';
import { lintSkill } from './lint.mjs';
import { orderPlan, isForbidden, isReviewOpener, uncoveredGroups } from './plan.mjs';
import { expectedTotal } from './runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f) => path.join(here, 'fixtures/patterns', f);
const useKiosk = (f) => {
  const [file, query] = f.split('?');
  process.env.KIOSK_URL = pathToFileURL(fixture(file)).href + (query ? `?${query}` : '');
};
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

test('I-193: a keep-ordering button is not a payment control; checkout and payment labels still are', () => {
  for (const ok of ['계속 주문하기', ' « 계속 주문하기 » ', '계속\n주문하기', '더 담기', '취소', '이전', '처음으로', '장바구니', '머핀',
    'Continue ordering', 'Back', 'Cancel', 'Add more']) {
    assert.equal(isForbidden(ok), false, ok);
  }
  for (const bad of ['주문하기', '주문 하기', '주문하기 12,500원', '주문하기\n총 2개', '바로 주문하기', '결제', '결제하기', '결제 수단 선택',
    '카드결제', '간편결제', '주문완료', '구매하기', '💳 신용/체크카드', '쿠폰', 'Pay', 'Pay now', 'Payment', 'Checkout',
    'Place order', 'Order now', 'Continue to payment', 'Back to checkout']) {
    assert.equal(isForbidden(bad), true, bad);
  }
  // A skill's forbiddenLabels match whole labels: listing 주문하기 does not take 계속 주문하기 with it.
  assert.equal(isForbidden('닫기', ['닫기']), true);
  assert.equal(isForbidden('계속 주문하기', ['주문하기']), false);
});

test('I-193: the driver taps 계속 주문하기 and Continue ordering on a timeout modal, and still refuses 주문하기 and Order now', async () => {
  await onPage('modal.html', [{ op: 'click', label: '시작하기' }, { op: 'click', label: '머핀' }], async ({ page }) => {
    assert.ok(await page.isVisible('#modal'));
    await act(page, { op: 'click', label: '계속 주문하기' });
    assert.ok(await page.isHidden('#modal'), 'the modal closed');
    await assert.rejects(act(page, { op: 'click', label: '주문하기' }), /payment or checkout/);
    assert.ok(await page.isVisible('#menu'), 'still on the menu');
  });
  await onPage('modal.html?lang=en', [{ op: 'click', label: 'Start' }, { op: 'click', label: 'Muffin' }], async ({ page }) => {
    await act(page, { op: 'click', label: 'Continue ordering' });
    assert.ok(await page.isHidden('#modal'), 'the modal closed');
    await assert.rejects(act(page, { op: 'click', label: 'Order now' }), /payment or checkout/);
    await assert.rejects(act(page, { op: 'click', role: 'button', name: 'Order now' }), /payment or checkout/);
    assert.ok(await page.isVisible('#menu'), 'still on the menu');
  });
});

test('I-193: the runner replays an order through the timeout modal, and still refuses a plan with Order now', async () => {
  useKiosk('modal.html');
  const r = await runOrder(skillOf('modal.skill.json'), { lines: [line('머핀', [], 2), line('스콘', [])] });
  assert.equal(r.error, undefined);
  assert.equal(r.shownTotal, 2 * 2500 + 3000);
  assert.ok(r.ok);
  useKiosk('modal.html?lang=en');
  const en = skillOf('modal.en.skill.json');
  assert.ok((await runOrder(en, { lines: [line('Scone', [])] })).ok);
  en.recipes.addToCart.push({ op: 'click', label: 'Order now' });
  const refused = await runOrder(en, { lines: [line('Scone', [])] });
  assert.match(refused.error, /refused before any click: the plan clicks a forbidden label: Order now/);
});

test('I-193: the audit counts Order now as a checkout control without forbiddenLabels, and the lint accepts 계속 주문하기', async () => {
  useKiosk('modal.html?lang=en');
  const r = await audit(skillOf('modal.en.skill.json'));
  assert.deepEqual(r.unknownLabels, []);
  assert.ok(r.ok, JSON.stringify(r));
  const skill = skillOf('modal.skill.json');
  skill.recipes.startOrder.push({ op: 'clickIfVisible', label: '계속 주문하기' });
  assert.deepEqual(lintSkill(skill), []);
  skill.recipes.startOrder.push({ op: 'click', label: 'Order now' });
  assert.match(lintSkill(skill).join('\n'), /payment or checkout control \(Order now\)/);
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

// ---------- round 3: interrupts (I-194), verified totals (I-195), option-group coverage (I-197) ----------

const interruptSkill = () => skillOf('interrupt.skill.json');
const latte = line('라떼', ['ICED', '라지']);

test('I-194: a modal that comes up in the middle of a line stops a skill without interrupts', async () => {
  useKiosk('interrupt.html');
  const skill = interruptSkill();
  delete skill.interrupts;
  const r = await runOrder(skill, { lines: [latte, line('머핀', [])] });
  assert.match(r.error ?? '', /Timeout|intercepts|no tappable label/);
  assert.equal(r.ok, false);
});

test('I-194: the runner answers a declared interrupt before the next step and finishes the order', async () => {
  useKiosk('interrupt.html');
  const r = await runOrder(interruptSkill(), { lines: [latte, line('머핀', [])] });
  assert.equal(r.error, undefined);
  assert.equal(r.kioskTotal, 4000 + 500 + 700 + 2500);
  assert.ok(r.ok);
  assert.ok(r.interruptsAnswered.length >= 1);
  assert.ok(r.interruptsAnswered.every((a) => a.text === '계속 주문하시겠어요?'));
});

test('I-194: after a click times out under an interrupt, the runner answers it and retries the step once', async () => {
  useKiosk('interrupt.html?on=enter');
  const r = await runOrder(interruptSkill(), { lines: [latte] });
  assert.equal(r.error, undefined);
  assert.ok(r.ok);
  assert.deepEqual(r.interruptsAnswered.map((a) => [a.text, a.afterError]), [['계속 주문하시겠어요?', true]]);
});

test('I-194: an interrupt is answered only with a control that neither orders nor pays, checked before any click', async () => {
  useKiosk('interrupt.html');
  const skill = interruptSkill();
  skill.interrupts = [{ text: '계속 주문하시겠어요?', dismiss: { op: 'click', label: '주문하기' } }];
  const r = await runOrder(skill, { lines: [line('머핀', [])] });
  assert.match(r.error, /refused before any click/);
  assert.match(lintSkill(skill).join('\n'), /interrupt .*payment or checkout control/);
  const named = interruptSkill();
  named.interrupts = [{ text: '계속 주문하시겠어요?', dismiss: { op: 'click', label: '머핀' } }];
  assert.match(lintSkill(named).join('\n'), /interrupt .*is an item, category or option/);
  const vague = interruptSkill();
  vague.interrupts = [{ text: '네', dismiss: { op: 'click', label: '계속 주문하기' } }];
  assert.match(lintSkill(vague).join('\n'), /interrupt .*text/);
  assert.deepEqual(lintSkill(interruptSkill()), []);
});

test('verified totals: only the order button opens the review; payment, send and listed labels never do', () => {
  for (const ok of ['주문하기', '주문 하기', '주문하기 12,500원', '주문하기 (3)', '주문', 'Order', '🛒 주문하기']) assert.equal(isReviewOpener(ok), true, ok);
  for (const bad of ['결제하기', '카드결제', '주문완료', '주문 전송', '바로 주문하기', '주문하기\n결제', 'Place order', 'Order now', 'Checkout',
    'Pay', 'Submit order', '계속 주문하기', '장바구니', '']) assert.equal(isReviewOpener(bad), false, bad);
  assert.equal(isReviewOpener('주문하기', ['주문하기']), false, "the skill's own forbiddenLabels always win");
});

test('verified totals: the driver opens the review only through openReview on the order button', async () => {
  useKiosk('review.html');
  const k = await openKiosk();
  try {
    for (const s of [{ op: 'click', label: '시작하기' }, { op: 'click', label: '포장해요' }, { op: 'click', label: '쿠키' }, { op: 'click', label: '담기' }]) await act(k.page, s);
    await assert.rejects(act(k.page, { op: 'click', label: '주문하기' }), /payment or checkout/);
    await assert.rejects(act(k.page, { op: 'openReview', label: '주문하기' }, { forbidden: ['주문하기'] }), /not the order button/);
    await assert.rejects(act(k.page, { op: 'openReview', label: '쿠키' }), /not the order button/);
    assert.ok(await k.page.isVisible('#menu'), 'still on the menu');
    await act(k.page, { op: 'openReview', label: '주문하기' });
    assert.ok(await k.page.isVisible('#review'));
    await assert.rejects(act(k.page, { op: 'openReview', label: '결제하기' }), /not the order button/);
    await assert.rejects(act(k.page, { op: 'click', label: '결제하기' }), /payment or checkout/);
    assert.ok(await k.page.isVisible('#review'), 'still on the review');
  } finally { await k.browser.close(); }
});

test("I-195: the kiosk's review total wins: a take-out charge the skill lacks fails the order with a flag", async () => {
  useKiosk('review.html');
  const skill = skillOf('review.skill.json');
  delete skill.charges;
  const r = await runOrder(skill, { dineOption: '포장해요', lines: [line('커피', ['라지'])] });
  assert.equal(r.error, undefined);
  assert.equal(r.cartTotal, 3500);
  assert.equal(r.reviewTotal, 3600);
  assert.equal(r.kioskTotal, 3600);
  assert.equal(r.skillTotal, 3500);
  assert.equal(r.totalSource, 'review');
  assert.equal(r.ok, false);
  assert.match(r.totalMismatch, /3,500.*3,600/);
});

test('I-195: with the charge in the skill, take-out and eat-in orders match the review total', async () => {
  useKiosk('review.html');
  const skill = skillOf('review.skill.json');
  const take = await runOrder(skill, { dineOption: '포장해요', lines: [line('커피', ['라지']), line('쿠키', [])] });
  assert.equal(take.error, undefined);
  assert.deepEqual([take.kioskTotal, take.skillTotal, take.ok, take.totalMismatch], [5100, 5100, true, undefined]);
  const eat = await runOrder(skill, { dineOption: '먹고 가요', lines: [line('커피', [])] });
  assert.deepEqual([eat.kioskTotal, eat.skillTotal, eat.ok], [3000, 3000, true]);
  assert.equal(expectedTotal(skill, { dineOption: '포장해요', lines: [line('쿠키', [], 2)] }), 3100);
  assert.deepEqual(lintSkill(skill), []);
});

test('I-195: a skill without review on a kiosk with an order button says so, and the total comes from the cart', async () => {
  useKiosk('review.html');
  const skill = skillOf('review.skill.json');
  delete skill.review;
  delete skill.charges;
  const r = await runOrder(skill, { dineOption: '포장해요', lines: [line('쿠키', [])] });
  assert.equal(r.totalSource, 'cart');
  assert.equal(r.kioskTotal, 1500);
  assert.equal(r.reviewOpener, '주문하기');
});

test('I-195: an order button that sends the order (no payment step after it) is flagged and fails', async () => {
  useKiosk('review.html?send=1');
  const r = await runOrder(skillOf('review.skill.json'), { dineOption: '먹고 가요', lines: [line('쿠키', [])] });
  assert.equal(r.ok, false);
  assert.equal(r.reviewUnsafe, true);
  assert.match(r.error, /no payment step/);
});

test('I-195: a review that would tap a payment control is refused before any click, and the lint says why', async () => {
  useKiosk('review.html');
  const skill = skillOf('review.skill.json');
  skill.review.open = [{ op: 'openReview', label: '주문하기' }, { op: 'click', label: '결제하기' }];
  const r = await runOrder(skill, { dineOption: '먹고 가요', lines: [line('쿠키', [])] });
  assert.match(r.error, /refused before any click/);
  assert.match(lintSkill(skill).join('\n'), /review.*payment or checkout control \(결제하기\)/);
  const pay = skillOf('review.skill.json');
  pay.review.open = [{ op: 'openReview', label: '결제하기' }];
  assert.match((await runOrder(pay, { dineOption: '먹고 가요', lines: [line('쿠키', [])] })).error, /refused before any click/);
  assert.match(lintSkill(pay).join('\n'), /openReview .*order button/);
  const elsewhere = skillOf('review.skill.json');
  elsewhere.recipes.addToCart.push({ op: 'openReview', label: '주문하기' });
  assert.match(lintSkill(elsewhere).join('\n'), /openReview .*only in review.open/);
  const charge = skillOf('review.skill.json');
  charge.charges = [{ name: '포장 용기', amount: 100, dineOption: '포장' }];
  assert.match(lintSkill(charge).join('\n'), /charge "포장 용기".*dineOption/);
});

test('I-197: coverage lists option groups no passing order used; a 0원 pick does not cover a priced group', () => {
  const skill = skillOf('stepper.skill.json');
  const o = (...lines) => ({ lines });
  assert.deepEqual(uncoveredGroups(skill, [o(line('스콘', []))]).map((g) => g.group), ['온도', '얼음량', '추가']);
  assert.deepEqual(uncoveredGroups(skill, [o(line('라떼', ['HOT', '바닐라 시럽']))]).map((g) => g.group), ['얼음량']);
  assert.deepEqual(uncoveredGroups(skill, [o(line('라떼', ['ICED', '적게', '에스프레소 샷']))]), []);
  // A group with priced options needs a priced pick: a 0원 pick cannot show a wrong price.
  const sized = skillOf('review.skill.json');
  assert.deepEqual(uncoveredGroups(sized, [o(line('커피', ['레귤러']))]).map((g) => [g.group, g.item]), [['사이즈', '커피']]);
  assert.deepEqual(uncoveredGroups(sized, [o(line('커피', ['라지']))]), []);
  // Sold-out items cannot be ordered, so their groups are not asked for; a group shared by two items counts once.
  sized.catalog.push({ name: '라떼', category: '메뉴', price: 3500, soldOut: true, optionGroups: [{ name: '샷', options: [{ name: '샷 추가', priceDelta: 500 }] }] },
    { name: '티', category: '메뉴', price: 2500, soldOut: false, optionGroups: [structuredClone(sized.catalog[0].optionGroups[0])] });
  assert.deepEqual(uncoveredGroups(sized, [o(line('티', ['라지']))]), []);
});

// ---------- round 4: customer choices are option groups, never fixed in a recipe; popups that change the order ----------
// Fixture: fixtures/patterns/choice.html (a required 단맛 group with numeric labels, no price and no default; a snack
// set offered after the add button; a points popup without prices). No test kiosk is opened here.

const choiceSkill = () => skillOf('choice.skill.json');
const drink = (item, options, qty = 1) => ({ category: '음료', item, options, qty });
const snack = (item, qty = 1) => ({ category: '간식', item, options: [], qty });
const without = (skill, drop) => { for (const it of skill.catalog) it.optionGroups = it.optionGroups.filter((g) => !drop(g)); return skill; };

test('round 4: an option named with digits (0%, 50%, 2) is a customer choice; bare symbols and navigation are still controls', () => {
  const skill = choiceSkill();
  assert.deepEqual(lintSkill(skill), []);
  skill.catalog[2].optionGroups = [{ name: '개수', required: true, min: 1, max: 1, options: [{ name: '2', priceDelta: 0 }, { name: '4', priceDelta: 1500 }] }];
  assert.deepEqual(lintSkill(skill), []);
  skill.catalog[0].optionGroups[1].options.push({ name: '+', priceDelta: 0 }, { name: '›', priceDelta: 0 }, { name: '다음', priceDelta: 0 }, { name: '단맛 더하기', priceDelta: 0 });
  const errors = lintSkill(skill);
  assert.equal(errors.length, 4, errors.join('\n'));
  assert.ok(errors.every((e) => /녹차라떼 › 단맛: option "(\+|›|다음|단맛 더하기)" is a control/.test(e)), errors.join('\n'));
});

test('round 4: the lint refuses a recipe step that taps a customer choice on every order', () => {
  const skill = choiceSkill();
  skill.recipes.addToCart.splice(3, 0, { op: 'clickIfVisible', label: '50%' });
  assert.match(lintSkill(skill).join('\n'), /recipe "addToCart" taps "50%" on every order.*단맛/);
  const select = choiceSkill();
  select.catalog[0].optionGroups[4].after = [{ op: 'click', label: 'L' }, { op: 'click', label: '다음' }];
  assert.match(lintSkill(select).join('\n'), /녹차라떼 › 세트 간식 taps "L" on every order, a choice of 녹차라떼 › 크기/);
});

test('round 4: chooseOptions with "groups" picks those groups where it stands, and a group whose appliesWhen does not hold is skipped with its after steps', () => {
  const skill = choiceSkill();
  const labels = (...lines) => orderPlan(skill, { lines }).map((s) => s.label ?? s.name);
  assert.deepEqual(labels(drink('녹차라떼', ['L', '50%', '펄', '간식 세트', '머핀'])),
    ['주문 시작', '음료', '녹차라떼', 'L', '50%', '펄', '담기', '간식 세트', '머핀', '다음', '세트 담기']);
  assert.deepEqual(labels(drink('아이스티', ['0%', '음료만']), snack('쿠키')),
    ['주문 시작', '음료', '아이스티', '0%', '담기', '음료만', '간식', '쿠키', '담기']);
  // One chooseOptions without "groups" still runs every group of the item, as in older skills.
  const one = choiceSkill();
  one.recipes.addToCart = one.recipes.addToCart.filter((s) => !s.groups);
  assert.deepEqual(orderPlan(one, { lines: [drink('녹차라떼', ['R', '0%', '음료만'])] }).map((s) => s.label ?? s.name),
    ['주문 시작', '음료', '녹차라떼', 'R', '0%', '음료만', '담기']);
  const unknown = choiceSkill();
  unknown.recipes.addToCart.at(-1).groups = ['세트', '셋트 간식'];
  assert.match(lintSkill(unknown).join('\n'), /chooseOptions names group "셋트 간식", which no item has/);
});

test('round 4: a set offered after the add button replays as option groups, and its total matches the kiosk', async () => {
  useKiosk('choice.html');
  const r = await runOrder(choiceSkill(), { lines: [drink('녹차라떼', ['L', '50%', '펄', '간식 세트', '머핀'], 2), drink('아이스티', ['0%', '음료만']), snack('쿠키')] });
  assert.equal(r.error, undefined);
  assert.equal(r.kioskTotal, (4000 + 500 + 500 - 300 + 2500) * 2 + 3500 + 2000);
  assert.ok(r.ok);
  assert.deepEqual(r.interruptsAnswered.map((a) => a.text), ['포인트를 적립할까요?']);
});

test('round 4: the audit passes the modelled skill: no tapped choice, no unmodelled required choice, nothing missing', async () => {
  useKiosk('choice.html');
  const r = await audit(choiceSkill());
  assert.deepEqual([r.hardClicks, r.requiredChoices, r.missingOptions], [[], {}, {}]);
  assert.ok(r.ok, JSON.stringify(r));
});

test('round 4: the audit fails a recipe that taps one of several choices on the item screen for the customer', async () => {
  useKiosk('choice.html');
  const skill = without(choiceSkill(), (g) => g.name === '단맛');
  skill.recipes.addToCart.splice(3, 0, { op: 'clickIfVisible', label: '50%' });
  const r = await audit(skill);
  assert.equal(r.ok, false);
  assert.deepEqual(r.hardClicks.map((h) => [h.label, h.where, h.alternatives]), [['50%', 'item screen', ['0%', '100%']]]);
  assert.deepEqual(r.missingOptions, { 녹차라떼: ['0%', '50%', '100%'], 아이스티: ['0%', '50%', '100%'] });
});

test('round 4: the audit fails a skill that leaves out a choice the kiosk will not add an item without', async () => {
  useKiosk('choice.html');
  const r = await audit(without(choiceSkill(), (g) => g.name === '단맛'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.hardClicks, []);
  assert.deepEqual(Object.keys(r.requiredChoices), ['녹차라떼', '아이스티']);
  assert.deepEqual(r.requiredChoices['녹차라떼'].choices, ['0%', '50%', '100%']);
  // A left-out choice the kiosk adds without (a size with a default) stays informational.
  const sized = await audit(without(choiceSkill(), (g) => g.name === '크기'));
  assert.deepEqual([sized.ok, sized.requiredChoices, sized.missingOptions.녹차라떼], [true, {}, ['R', 'L']]);
});

test('round 4: always declining a popup that changes the order fails the audit unless the skill declares it; a declaration never covers an item-screen choice', async () => {
  useKiosk('choice.html');
  const skill = without(choiceSkill(), (g) => g.name.startsWith('세트'));
  skill.recipes.addToCart.splice(-1, 1, { op: 'clickIfVisible', label: '음료만' });
  const r = await audit(skill);
  assert.equal(r.ok, false);
  assert.deepEqual(r.hardClicks.map((h) => [h.label, h.where]), [['음료만', 'popup']]);
  skill.declines = [{ choice: '음료만', offer: '간식 세트 (세트 할인 -300원)' }];
  assert.deepEqual(lintSkill(skill), []);
  const declared = await audit(skill);
  assert.ok(declared.ok, JSON.stringify(declared));
  without(skill, (g) => g.name === '단맛');
  skill.recipes.addToCart.splice(3, 0, { op: 'clickIfVisible', label: '50%' });
  skill.declines.push({ choice: '50%', offer: '단맛' });
  const sheet = await audit(skill);
  assert.deepEqual(sheet.hardClicks.map((h) => [h.label, h.where]), [['50%', 'item screen']]);
  const bad = choiceSkill();
  bad.declines = [{ choice: '음료만' }, { choice: '카드 결제', offer: 'x' }];
  assert.match(lintSkill(bad).join('\n'), /declines "음료만": .*option/);
  assert.match(lintSkill(bad).join('\n'), /declines "카드 결제": .*payment/);
});

test('round 4 speed: a second audit of an unchanged skill reuses what it saw; a changed recipe replays lines but not item screens', async () => {
  useKiosk('choice.html');
  resetAuditMemo();
  const skill = choiceSkill();
  const first = await audit(skill);
  assert.ok(first.work.itemScreens > 0 && first.work.lineProbes > 0, JSON.stringify(first.work));
  const again = await audit(skill);
  assert.deepEqual(again.work, { itemScreens: 0, lineProbes: 0 });
  assert.deepEqual({ ...again, work: null }, { ...first, work: null });
  skill.recipes.addToCart.push({ op: 'clickIfVisible', label: '닫기' });
  const changed = await audit(skill);
  assert.equal(changed.work.itemScreens, 0);
  assert.ok(changed.work.lineProbes > 0);
});

test('round 4 (bk8): a button showing a running total (0원 on a fresh order) is a control, not an item missing from the catalog', async () => {
  useKiosk('choice.html');
  const r = await audit(choiceSkill());
  assert.deepEqual([r.missingItems, r.unknownLabels, r.hiddenUnder], [[], [], {}]);
  assert.ok(r.ok, JSON.stringify(r));
  const fewer = choiceSkill();
  fewer.catalog = fewer.catalog.filter((c) => c.name !== '머핀');
  assert.deepEqual((await audit(fewer)).missingItems, ['머핀 2,500원'], 'a priced tile is still an item');
});

test('round 4: a one-word choice that ends like a stepper word (곱빼기, a large portion) is a choice; "수량 빼기" is still a control', () => {
  const skill = choiceSkill();
  skill.catalog[2].optionGroups = [{ name: '양', required: false, min: 0, max: 1, options: [{ name: '곱빼기', priceDelta: 2000 }] }];
  assert.deepEqual(lintSkill(skill), []);
  skill.catalog[2].optionGroups[0].options.push({ name: '수량 빼기', priceDelta: 0 }, { name: '빼기', priceDelta: 0 });
  assert.equal(lintSkill(skill).length, 2, lintSkill(skill).join('\n'));
});
