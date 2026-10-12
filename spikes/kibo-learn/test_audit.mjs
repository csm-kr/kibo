// Regression test for the coverage audit on real learned skills. Run: node test_audit.mjs <pizzaUrl> <blindUrl>
import { audit } from './audit.mjs';
import fs from 'node:fs';
const [pizza, blind] = process.argv.slice(2);
const cases = [
  ['fixtures/a_pizza.json', pizza, true, 'complete pizza skill passes'],
  ['fixtures/a_sol.json', blind, false, 'skill missing three categories is rejected'],
  ['fixtures/a_v3.json', blind, true, 'complete 40-item cafe skill passes'],
  ['fixtures/a_v3_cheat.json', blind, false, 'category disguised as a button is caught'],
];
let fail = 0;
for (const [file, url, want, name] of cases) {
  process.env.KIOSK_URL = url;
  const r = await audit(JSON.parse(fs.readFileSync(file, 'utf8')));
  const ok = r.ok === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
process.exit(fail ? 1 : 0);
