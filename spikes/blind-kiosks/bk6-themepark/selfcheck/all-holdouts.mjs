// Extra builder check (beyond the 3 hand-written scripts): places all 10 holdout orders
// from answer-key.json through the UI and compares the payment-screen total.
import { launch, KEY, wonToInt } from './lib.mjs';

const cats = KEY.categories.map((c) => c.label);
let fails = 0;
for (const h of KEY.holdoutOrders) {
  const { browser, page: p, errors } = await launch();
  const en = h.language === 'en';
  if (en) await p.click('[data-act="lang"][data-lang="en"]');
  await p.click('.att-touch');
  let first = true;
  const items = [...h.lines.map((l) => ({ ...l, soldOut: false })), ...(h.requestedButSoldOut || []).map((n) => ({ item: n, soldOut: true }))];
  for (const line of items) {
    const it = KEY.items.find((i) => i.name === line.item);
    await p.click(`.tabs li:nth-child(${cats.indexOf(it.category) + 1})`);
    const card = `.card:has(.nm:text-is("${en ? it.nameEn : it.name}"))`;
    if (line.soldOut) {
      await p.click(card);
      await p.click('[data-act="m-ok"]');
      continue;
    }
    if (it.category === '기념품') {
      for (let i = 0; i < line.qty; i++) await p.click(card);
    } else {
      await p.click(card);
      for (const [g, ids] of Object.entries(line.options)) {
        if (g === 'discount') await p.click(`[data-act="disc"][data-v="${ids[0]}"]`);
        else if (g === 'topping') for (const v of ids) await p.click(`[data-act="top"][data-v="${v}"]`);
        else if (g === 'size') await p.click(`[data-act="size"][data-v="${ids[0]}"]`);
        else for (const a of ids) await p.click(`[data-act="age-plus"][data-age="${a}"]`);
      }
      if (!it.category.includes('권')) for (let i = 1; i < line.qty; i++) await p.click('[data-act="qty-plus"]');
      await p.click('[data-act="sheet-add"]');
    }
    if (first) { await p.click('[data-act="member-no"]'); first = false; }
  }
  await p.click('.bar-order');
  await p.click('[data-act="review-pay"]');
  const total = wonToInt(await p.textContent('#pay-total'));
  await browser.close();
  const ok = total === h.expectedTotal && !errors.length;
  if (!ok) fails++;
  console.log(`${h.id} (${h.language}): expected ${h.expectedTotal} / kiosk ${total} => ${ok ? 'MATCH' : 'MISMATCH'}${errors.length ? ' errors: ' + errors.join('|') : ''}`);
}
console.log(fails ? `${fails} holdout(s) mismatched` : 'all 10 holdouts match');
process.exitCode = fails ? 1 : 0;
