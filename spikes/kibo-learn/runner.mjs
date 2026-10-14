// Replays a learned kiosk skill with no LLM in the loop, then checks the kiosk's own total: on its order review when
// the skill declares one (round 3, I-195), otherwise in its cart.
import fs from 'node:fs';
import { openKiosk, runSteps, snapshot, answerInterrupts, tappableLabels } from './driver.mjs';
import { isPaymentControl, isReviewOpener, lineVars, unsafeTargets } from './plan.mjs';

// order: { dineOption, lines: [{ category, item, options: [], qty }] }. A quantity option is repeated in options.
// The skill's charges (a take-out container, a service charge) are added once per order, for their dineOption only
// when they name one.
export function expectedTotal(skill, order) {
  let total = 0;
  for (const l of order.lines) {
    const it = skill.catalog.find((c) => c.name === l.item);
    if (!it) throw new Error(`item not in catalog: ${l.item}`);
    const deltas = (it.optionGroups ?? []).flatMap((g) => g.options);
    const extra = l.options.reduce((a, o) => a + (deltas.find((d) => d.name === o)?.priceDelta ?? NaN), 0);
    total += (it.price + extra) * l.qty;
  }
  for (const c of skill.charges ?? []) if (c.dineOption == null || c.dineOption === order.dineOption) total += c.amount;
  return total;
}

const readTotal = (snap, pattern) => Number((snap.match(new RegExp(pattern)) ?? [])[1]?.replace(/,/g, ''));
const won = (n) => (Number.isFinite(n) ? `${n.toLocaleString('en-US')}원` : 'unreadable');

// Opens the order review with the skill's steps and reads the total there. The order button must lead to a payment
// step: a payment control (결제하기, 카드 결제) that was not on screen before. If none appears, the button may have
// sent the order (a pay-later device), so the replay stops with reviewUnsafe. Then the close steps, if any, run.
async function readReview(page, alerts, skill, opts) {
  const before = new Set((await tappableLabels(page)).filter(isPaymentControl));
  await runSteps(page, skill.review.open, {}, opts);
  await page.waitForTimeout(200);
  await answerInterrupts(page, opts.interrupts, opts);
  if (!(await tappableLabels(page)).some((l) => isPaymentControl(l) && !before.has(l))) {
    const e = new Error('review: no payment step appeared after the order button, so it may have sent the order; never open this kiosk\'s review');
    e.reviewUnsafe = true;
    throw e;
  }
  const reviewTotal = readTotal(await snapshot(page, alerts), skill.review.totalPattern);
  if (skill.review.close?.length) await runSteps(page, skill.review.close, {}, opts);
  return { reviewTotal };
}

export async function runOrder(skill, order) {
  // The whole plan is checked before the kiosk opens: an order never goes near payment (pattern 3).
  let bad;
  try {
    bad = unsafeTargets(skill, order);
  } catch (e) {
    return { ok: false, error: `refused before any click: ${e.message}` };
  }
  if (bad.length) return { ok: false, error: `refused before any click: the plan clicks a forbidden label: ${bad.join(', ')}` };
  const answered = [];
  const opts = { forbidden: skill.forbiddenLabels, interrupts: skill.interrupts, answered };
  const interrupts = () => (answered.length ? { interruptsAnswered: answered } : {});
  const { browser, page, alerts } = await openKiosk();
  const t0 = Date.now();
  try {
    await runSteps(page, skill.recipes.startOrder, { dineOption: order.dineOption }, opts);
    for (const l of order.lines) {
      const item = skill.catalog.find((c) => c.name === l.item);
      await runSteps(page, skill.recipes[item?.recipe ?? 'addToCart'], lineVars(skill, l), opts);
    }
    await answerInterrupts(page, skill.interrupts, opts);
    const snap = await snapshot(page, alerts);
    const cartTotal = readTotal(snap, skill.cartTotalPattern);
    const skillTotal = expectedTotal(skill, order);
    const cart = snap.split('\n').filter((x) => /listitem/.test(x)).join('\n');
    let review = {};
    if (skill.review) review = await readReview(page, alerts, skill, opts);
    else {
      // A kiosk that shows its order button may add charges on its review; the learner's gate asks for the review then.
      const opener = (await tappableLabels(page)).find((l) => isReviewOpener(l));
      if (opener) review = { reviewOpener: opener };
    }
    // The kiosk's total wins: it is what the customer pays. A skill total that differs is flagged and fails the order.
    const kioskTotal = review.reviewTotal ?? cartTotal;
    const ok = kioskTotal === skillTotal;
    return {
      ok, kioskTotal, skillTotal, totalSource: 'reviewTotal' in review ? 'review' : 'cart', cartTotal, ...review,
      ...(ok ? {} : { totalMismatch: `the skill's total ${won(skillTotal)} differs from the kiosk's ${won(kioskTotal)}; quote the kiosk's` }),
      shownTotal: kioskTotal, expectedTotal: skillTotal, ms: Date.now() - t0, cart, ...interrupts(),
    };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0], ...(e.reviewUnsafe ? { reviewUnsafe: true } : {}), ...interrupts(), snapshot: await snapshot(page, alerts) };
  } finally {
    await browser.close();
  }
}

if (process.argv[1].split('/').pop() === 'runner.mjs') {
  const skill = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const order = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  console.log(JSON.stringify(await runOrder(skill, order), null, 2));
}
