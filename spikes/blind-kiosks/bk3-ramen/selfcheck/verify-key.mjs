// Recomputes every holdout expectedTotal from the answer key's own item and option prices.
// Usage: node selfcheck/verify-key.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = JSON.parse(readFileSync(path.join(root, 'answer-key.json'), 'utf8'));
let ok = true;
for (const h of key.holdoutOrders) {
  let total = 0;
  for (const l of h.lines) {
    const item = key.items.find((i) => i.name === l.item);
    if (!item || item.soldOut) throw new Error(`${h.id}: bad item ${l.item}`);
    let unit = item.basePrice;
    for (const [g, ids] of Object.entries(l.options)) {
      if (!item.optionGroups.includes(g)) throw new Error(`${h.id}: ${l.item} has no group ${g}`);
      for (const id of ids) unit += key.optionGroups[g].options.find((o) => o.id === id).priceDelta;
    }
    total += unit * l.qty;
  }
  const match = total === h.expectedTotal;
  ok = ok && match;
  console.log(`${h.id}: computed=${total} key=${h.expectedTotal} ${match ? 'OK' : 'MISMATCH'}`);
}
process.exit(ok ? 0 : 1);
