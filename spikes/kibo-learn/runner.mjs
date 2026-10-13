// Replays a learned kiosk skill with no LLM in the loop, then checks the kiosk's own cart.
import fs from 'node:fs';
import { openKiosk, runSteps, snapshot } from './driver.mjs';
import { isForbidden, lineVars, orderPlan } from './plan.mjs';

// order: { dineOption, lines: [{ category, item, options: [], qty }] }. A quantity option is repeated in options.
export function expectedTotal(skill, order) {
  let total = 0;
  for (const l of order.lines) {
    const it = skill.catalog.find((c) => c.name === l.item);
    if (!it) throw new Error(`item not in catalog: ${l.item}`);
    const deltas = (it.optionGroups ?? []).flatMap((g) => g.options);
    const extra = l.options.reduce((a, o) => a + (deltas.find((d) => d.name === o)?.priceDelta ?? NaN), 0);
    total += (it.price + extra) * l.qty;
  }
  return total;
}

export async function runOrder(skill, order) {
  // The whole plan is checked before the kiosk opens: an order never goes near payment (pattern 3).
  let bad;
  try {
    bad = orderPlan(skill, order).map((s) => [s.label, s.name, s.text].find((t) => t && isForbidden(t, skill.forbiddenLabels))).filter(Boolean);
  } catch (e) {
    return { ok: false, error: `refused before any click: ${e.message}` };
  }
  if (bad.length) return { ok: false, error: `refused before any click: the plan clicks a forbidden label: ${bad.join(', ')}` };
  const opts = { forbidden: skill.forbiddenLabels };
  const { browser, page, alerts } = await openKiosk();
  const t0 = Date.now();
  try {
    await runSteps(page, skill.recipes.startOrder, { dineOption: order.dineOption }, opts);
    for (const l of order.lines) {
      const item = skill.catalog.find((c) => c.name === l.item);
      await runSteps(page, skill.recipes[item?.recipe ?? 'addToCart'], lineVars(skill, l), opts);
    }
    const snap = await snapshot(page, alerts);
    const shown = Number((snap.match(new RegExp(skill.cartTotalPattern)) ?? [])[1]?.replace(/,/g, ''));
    const want = expectedTotal(skill, order);
    return { ok: shown === want, shownTotal: shown, expectedTotal: want, ms: Date.now() - t0, cart: snap.split('\n').filter((x) => /listitem/.test(x)).join('\n') };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0], snapshot: await snapshot(page, alerts) };
  } finally {
    await browser.close();
  }
}

if (process.argv[1].split('/').pop() === 'runner.mjs') {
  const skill = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const order = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  console.log(JSON.stringify(await runOrder(skill, order), null, 2));
}
