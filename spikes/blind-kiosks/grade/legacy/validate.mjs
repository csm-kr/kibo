// Checks grade.mjs on known data: the earlier blind café (Gureum Darak Coffee) and its Gemini skills
// v3run1 and v3run2, whose numbers the old graders published (spikes/blind-kiosk/results/v3run*/grade*.txt,
// spikes/blind-kiosk/results/holdout.log). Prints the new grader's numbers next to the old definitions.
// Usage: node validate.mjs [--no-orders]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, OUT } from './convert.mjs';
import { gradeKiosk, writeGrade } from '../grade.mjs';
import { compareItemOptions, keyGroupsOf, pairItems } from '../lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OLD = path.resolve(HERE, '../../../blind-kiosk');
const oldKey = JSON.parse(fs.readFileSync(path.join(OLD, 'answer-key/answer-key.json'), 'utf8'));
const key = convert(oldKey);
fs.writeFileSync(OUT, JSON.stringify(key, null, 2) + '\n');

// grade_fair.py: sold-out items and the old key's sets (no option groups there) are skipped; the ice group
// (conditional) and the shot stepper (no option rows in the old key) are not counted; 많이/보통/적게 are
// dropped from whatever the skill lists.
const OLD_SETS = new Set(oldKey.sets.map((s) => s.name));
function oldFair(skill) {
  let total = 0, exact = 0;
  for (const [i, j] of pairItems(key.items, skill.catalog)) {
    const k = key.items[i];
    if (k.soldOut || OLD_SETS.has(k.name) || !k.optionGroups.length) continue;
    total++;
    const r = compareItemOptions(keyGroupsOf(key, k), skill.catalog[j].optionGroups ?? [], {
      skip: (kg, conditional) => conditional || kg.type === 'quantity',
      excludeMapped: false,
      dropSkillOption: (so) => ['많이', '보통', '적게'].includes(so.name),
    });
    if (r.exact) exact++;
  }
  return { openableItemsWithOptions: total, exact };
}

const runOrders = !process.argv.includes('--no-orders');
for (const run of ['v3run1', 'v3run2']) {
  const skillPath = path.join(OLD, 'results', run, 'skill.json');
  const grade = await gradeKiosk({
    kioskId: 'gureum-legacy', skillPath, label: run, keyPath: OUT, appPath: path.join(OLD, 'app', 'index.html'), runOrders,
  });
  writeGrade(grade);
  const c = grade.catalog;
  console.log(JSON.stringify({
    run,
    oldCatalog: { items: c.items.key, found: c.items.matched, price: c.price.correct, category: c.category.correct, soldOut: c.soldOut.correct },
    oldFair: oldFair(JSON.parse(fs.readFileSync(skillPath, 'utf8'))),
    newOptions: c.options,
    orders: grade.orders && grade.orders.results.map((r) => `${r.id} ${r.outcome}${r.reason ? ` (${r.reason})` : ''}${r.kioskTotal != null ? ` kiosk ${r.kioskTotal}` : ''}`),
  }, null, 2));
}
