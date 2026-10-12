// Replays the answer key's 5 example orders (never shown to the learner) with each learned skill.
// Order wording comes from the answer key; names are mapped to the skill's names by ignoring spaces,
// which is what the voice agent does when it picks catalog entries.
import fs from 'node:fs';
import { runOrder } from './runner.mjs';
const norm = (s) => s.replace(/\s/g, '');
// "라지" matches "라지 (+500원)" but not "라지세트": the rest after the prefix must not start with a letter.
const same = (n, want) => norm(n) === norm(want) || (norm(n).startsWith(norm(want)) && !/^[가-힣A-Za-z]/.test(norm(n).slice(norm(want).length)));
const ORDERS = [
  { want: 9400, dine: 'eat_in', lines: [['커피', '아메리카노', ['ICED', '라지', '바닐라 시럽', '헤이즐넛 시럽'], 2]] },
  { want: 6000, dine: 'eat_in', lines: [['커피', '카페라떼', ['ICED', '라지', '오트밀크', '샷 추가', '샷 추가'], 1]] },
  { want: 6700, dine: 'take_out', lines: [['세트', '브런치 세트', ['카페라떼', 'ICED', '버터 크루아상', '데워주세요'], 1]] },
  { want: 10900, dine: 'eat_in', lines: [['베이커리·디저트', '플레인 베이글', ['데워주세요', '크림치즈 추가'], 2], ['베이커리·디저트', '버터 크루아상', ['그대로 주세요'], 1]] },
  { want: 26700, dine: 'eat_in', lines: [['커피', '카페모카', ['ICED', '맥스', '많이 올려주세요', '샷 추가'], 1], ['티', '얼그레이 티', ['HOT', '꿀 추가'], 1], ['세트', '투게더 세트', ['아메리카노', 'HOT', '바닐라라떼', 'ICED', '티라미수'], 1]] },
];
for (const run of process.argv.slice(2)) {
  const skill = JSON.parse(fs.readFileSync(`${run}/skill.json`, 'utf8'));
  for (const [i, o] of ORDERS.entries()) {
    const missing = [];
    const lines = o.lines.map(([category, item, opts, qty]) => {
      const it = skill.catalog.find((c) => same(c.name, item));
      const names = (it?.optionGroups ?? []).flatMap((g) => g.options.map((x) => x.name));
      const options = opts.map((x) => names.find((n) => norm(n) === norm(x)) ?? names.find((n) => same(n, x)) ?? (missing.push(x), null)).filter(Boolean);
      return { category: it?.category ?? category, item: it?.name ?? item, options, qty };
    });
    if (missing.length) { console.log(run, `#${i + 1}`, 'NOT EXPRESSIBLE (catalog lacks:', [...new Set(missing)].join(', ') + ')'); continue; }
    const r = await runOrder(skill, { dineOption: skill.dineOptions[o.dine], lines });
    const verdict = r.shownTotal === o.want ? 'PASS' : 'FAIL';
    console.log(run, `#${i + 1}`, verdict, JSON.stringify({ kioskShows: r.shownTotal, answerKey: o.want, skillPredicts: r.expectedTotal, ms: r.ms, error: r.error }));
  }
}
