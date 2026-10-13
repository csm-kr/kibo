// Converts the earlier blind café's answer key (spikes/blind-kiosk/answer-key/answer-key.json, Gureum Darak
// Coffee) into the new schema (PROTOCOL.md "Answer key schema"), so grade.mjs can be checked on known data.
// Usage: node convert.mjs   → writes gureum/answer-key.json next to this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../blind-kiosk/answer-key/answer-key.json');
export const OUT = path.join(HERE, 'gureum', 'answer-key.json');

const typeOf = (selectionType) => (/^multi/.test(selectionType) ? 'multi' : /^counter/.test(selectionType) ? 'quantity' : 'single');

export function convert(old) {
  const groups = {};
  for (const [id, g] of Object.entries(old.optionGroups)) {
    const type = typeOf(g.selectionType);
    const options = type === 'quantity'
      // The old key gives the shot stepper no option row; the cart calls it "샷 추가 N".
      ? [{ id: 'shot', label: '샷 추가', priceDelta: g.pricePerUnit, maxQty: g.max }]
      : g.options.map((o) => ({ id: o.label, label: o.label, priceDelta: o.priceDelta ?? 0 }));
    const def = options.find((o) => o.label === g.default)?.id ?? null;
    groups[id] = {
      title: g.title, type, required: g.required, min: g.min, max: g.max, default: def,
      // The old key says "temp = ICED"; name every temperature group so the condition points at a sibling.
      appliesWhen: g.visibleOnlyWhen ? 'temperature option (temp / tempHot / tempIced) is ICED' : null,
      options,
    };
  }
  // Single-temperature drinks show only one chip that can be picked (the other is greyed out).
  groups.tempHot = { ...groups.temp, default: 'HOT', options: groups.temp.options.filter((o) => o.id === 'HOT') };
  groups.tempIced = { ...groups.temp, default: 'ICED', options: groups.temp.options.filter((o) => o.id === 'ICED') };
  const temps = { HOT: 'tempHot', ICED: 'tempIced' };

  const tempGroup = (title) => ({ title, type: 'single', required: true, min: 1, max: 1, default: null, appliesWhen: null,
    options: [{ id: 'HOT', label: 'HOT', priceDelta: 0 }, { id: 'ICED', label: 'ICED', priceDelta: 0 }] });
  // Each set step becomes a group of its choices (sold-out choices cannot be picked, so they are left out),
  // plus the step's temperature (drinks) or warm-up (food that can be warmed) sub-choice.
  const setGroups = new Map();
  old.sets.forEach((set, si) => {
    const ids = [];
    for (const step of set.steps) {
      const id = `set${si + 1}_s${step.step}`;
      groups[id] = { title: step.title, type: 'single', required: true, min: 1, max: 1, default: null, appliesWhen: null,
        options: step.choices.filter((c) => !c.soldOut).map((c) => ({ id: c.name, label: c.name, priceDelta: c.priceDelta })) };
      ids.push(id);
      if (step.kind === 'drink') {
        groups[`${id}_temp`] = tempGroup(`${step.title} 온도`);
        ids.push(`${id}_temp`);
      } else if (step.choices.some((c) => c.warmChoiceRequired)) {
        groups[`${id}_warm`] = { ...groups.warm, appliesWhen: `${id} is a warmable item` };
        ids.push(`${id}_warm`);
      }
    }
    setGroups.set(set.name, ids);
  });

  const items = old.items.map((it) => ({
    name: it.name,
    category: it.category,
    basePrice: it.basePrice,
    soldOut: it.soldOut,
    timeLimited: it.unavailableReason ? { window: it.tileBadge, availableAtFakeClock: false } : null,
    optionGroups: setGroups.get(it.name) ?? (it.optionGroups ?? []).map((g) => {
      const id = g.split(' ')[0];
      return id === 'temp' && it.temperatures?.length === 1 ? temps[it.temperatures[0]] : id;
    }),
  }));

  return {
    kiosk: { name: old.kiosk.name, nameEn: old.kiosk.nameEn, domain: 'cafe (coffee, tea, bakery, sets)' },
    flow: old.flow,
    categories: old.categories.map((label) => ({ label, itemCount: old.counts.perCategory[label] })),
    optionGroups: groups,
    items,
    promotions: [{ rule: old.upsell.trigger, effect: 'Popup offering 뉴욕 치즈케이크, 티라미수, 초코칩 쿠키; the orders below decline it' }],
    holdoutOrders: HOLDOUT,
    quirks: [
      'Converted from the old answer key by spikes/blind-kiosks/grade/legacy/convert.mjs.',
      'Holdout orders are the old key\'s 5 example orders, written as option ids by hand; the converter checks each total.',
    ],
  };
}

// The old key's exampleOrders (and spikes/blind-kiosk/grade/holdout_blind.mjs), as option ids. Option ids
// are the labels; the shot stepper is "shot", listed once per shot. Dine labels as the kiosk shows them.
const HOLDOUT = [
  { id: 'e1', dine: '매장', expectedTotal: 9400, patterns: ['multiple option groups', 'qty > 1'],
    lines: [{ item: '아메리카노', options: { temp: ['ICED'], sizeCoffee: ['라지'], syrup: ['바닐라 시럽', '헤이즐넛 시럽'] }, qty: 2 }] },
  { id: 'e2', dine: '매장', expectedTotal: 6000, patterns: ['oat milk', 'extra shots'],
    lines: [{ item: '카페라떼', options: { temp: ['ICED'], sizeCoffee: ['라지'], milk: ['오트밀크'], shot: ['shot', 'shot'] }, qty: 1 }] },
  { id: 'e3', dine: '포장', expectedTotal: 6700, patterns: ['set (2 steps)'],
    lines: [{ item: '브런치 세트', options: { set1_s1: ['카페라떼'], set1_s1_temp: ['ICED'], set1_s2: ['버터 크루아상'], set1_s2_warm: ['데워주세요'] }, qty: 1 }] },
  { id: 'e4', dine: '매장', expectedTotal: 10900, patterns: ['warm-up choice', 'topping', 'qty > 1'],
    lines: [
      { item: '플레인 베이글', options: { warm: ['데워주세요'], creamcheese: ['크림치즈 추가'] }, qty: 2 },
      { item: '버터 크루아상', options: { warm: ['그대로 주세요'] }, qty: 1 },
    ] },
  { id: 'e5', dine: '매장', expectedTotal: 26700, patterns: ['paged grid page 2', 'whip, size, shot', 'honey', '3-step set'],
    lines: [
      { item: '카페모카', options: { temp: ['ICED'], sizeCoffee: ['맥스'], whip: ['많이 올려주세요'], shot: ['shot'] }, qty: 1 },
      { item: '얼그레이 티', options: { temp: ['HOT'], honey: ['꿀 추가'] }, qty: 1 },
      { item: '투게더 세트', options: { set3_s1: ['아메리카노'], set3_s1_temp: ['HOT'], set3_s2: ['바닐라라떼'], set3_s2_temp: ['ICED'], set3_s3: ['티라미수'] }, qty: 1 },
    ] },
];

// Total of an order from the key's own prices, to check the hand-written orders above.
export function keyTotal(key, order) {
  return order.lines.reduce((sum, l) => {
    const it = key.items.find((i) => i.name === l.item);
    if (!it) throw new Error(`unknown item ${l.item}`);
    const extra = Object.entries(l.options).flatMap(([gid, ids]) => {
      if (!it.optionGroups.includes(gid)) throw new Error(`${l.item} has no group ${gid}`);
      return ids.map((id) => {
        const o = key.optionGroups[gid].options.find((x) => x.id === id);
        if (!o) throw new Error(`group ${gid} has no option ${id}`);
        return o.priceDelta;
      });
    }).reduce((a, b) => a + b, 0);
    return sum + (it.basePrice + extra) * l.qty;
  }, 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const key = convert(JSON.parse(fs.readFileSync(SRC, 'utf8')));
  for (const o of key.holdoutOrders) {
    const t = keyTotal(key, o);
    if (t !== o.expectedTotal) throw new Error(`${o.id}: key prices give ${t}, the old key says ${o.expectedTotal}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(key, null, 2) + '\n');
  console.log(`written ${path.relative(process.cwd(), OUT)}: ${key.items.length} items, ${Object.keys(key.optionGroups).length} groups, ${key.holdoutOrders.length} orders (totals checked)`);
}
