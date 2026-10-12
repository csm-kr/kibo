// Held-out orders the learner never saw. Expected totals are computed by hand from the kiosk source, not from the learned catalog.
import fs from 'node:fs';
import { runOrder } from './runner.mjs';
const skill = JSON.parse(fs.readFileSync('skill.json', 'utf8'));
const T = '🛍 가져갈게요', E = '🍽 먹고 갈게요';
const cases = [
  { want: (17900 + 4000 + 3000 + 1500 + 800 + 2000) * 2, o: { dineOption: T, lines: [{ category: '피자', item: '페퍼로니', options: ['라지', '치즈크러스트', '베이컨', '올리브', '더블치즈'], qty: 2 }] } },
  { want: 2000 + 3300 + 7900, o: { dineOption: E, lines: [{ category: '음료', item: '콜라', options: ['500ml'], qty: 1 }, { category: '음료', item: '제로콜라', options: ['1.25L'], qty: 1 }, { category: '사이드', item: '버팔로 윙 6조각', options: [], qty: 1 }] } },
  { want: 19900 + 500 * 3 + 2000, o: { dineOption: E, lines: [{ category: '피자', item: '불고기 피자', options: ['레귤러', '씬'], qty: 1 }, { category: '사이드', item: '갈릭디핑소스', options: [], qty: 3 }, { category: '음료', item: '사이다', options: ['500ml'], qty: 1 }] } },
  { want: 15900 + 800 * 3, o: { dineOption: T, lines: [{ category: '피자', item: '마르게리따', options: ['레귤러', '오리지널', '올리브', '옥수수', '할라피뇨'], qty: 1 }] } },
  // rule violation: 4 toppings. The kiosk silently drops the 4th; the runner must notice the mismatch.
  { want: 'mismatch', o: { dineOption: E, lines: [{ category: '피자', item: '마르게리따', options: ['레귤러', '오리지널', '베이컨', '올리브', '옥수수', '할라피뇨'], qty: 1 }] } },
];
// Map the order's short names ("라지", "콜라") to the skill's own names ("라지 (+4,000원)"), as the voice agent would.
const norm = (x) => x.replace(/\s/g, '');
const pickName = (names, want) => names.find((n) => norm(n) === norm(want)) ?? names.find((n) => norm(n).startsWith(norm(want)) && !/^[가-힣A-Za-z]/.test(norm(n).slice(norm(want).length)));
for (const c of cases) {
  for (const l of c.o.lines) {
    const it = skill.catalog.find((x) => pickName([x.name], l.item));
    if (!it) continue;
    l.item = it.name;
    const names = (it.optionGroups ?? []).flatMap((g) => g.options.map((o) => o.name));
    l.options = l.options.map((o) => pickName(names, o) ?? o);
  }
  const r = await runOrder(skill, c.o);
  const verdict = c.want === 'mismatch' ? (!r.ok ? 'DETECTED' : 'MISSED') : (r.ok && r.shownTotal === c.want ? 'PASS' : 'FAIL');
  console.log(verdict, JSON.stringify({ shown: r.shownTotal, expectedBySkill: r.expectedTotal, handExpected: c.want, ms: r.ms, error: r.error }));
}
