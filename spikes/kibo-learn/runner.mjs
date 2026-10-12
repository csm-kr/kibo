// Replays a learned kiosk skill with no LLM in the loop, then checks the kiosk's own cart.
import fs from 'node:fs';
import { openKiosk, runSteps, snapshot } from './driver.mjs';

// order: { dineOption, lines: [{ category, item, options: [], qty }] }
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
  const { browser, page, alerts } = await openKiosk();
  const t0 = Date.now();
  try {
    await runSteps(page, skill.recipes.startOrder, { dineOption: order.dineOption });
    for (const l of order.lines) {
      const item = skill.catalog.find((c) => c.name === l.item);
      await runSteps(page, skill.recipes[item?.recipe ?? 'addToCart'], { ...l, qtyMinus1: l.qty - 1 });
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
