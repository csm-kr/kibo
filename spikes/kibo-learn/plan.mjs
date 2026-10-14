// Pure recipe expansion, shared by the runner (driver.mjs), the blind-kiosk grader and the tests: placeholders,
// loops and option choosing are resolved before the first click, so a plan can be checked without a browser.

const fill = (v, vars) => (typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : v);
export const fillStep = (s, vars) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v : fill(v, vars)]));

// The same normalization as the blind-kiosk grader (spikes/blind-kiosks/grade/lib.mjs).
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// Prices and counts are not part of a control's name ("주문하기 12,500원", "주문하기 (3)").
const bare = (s) => norm(String(s ?? '').replace(/\d[\d,.]*\s*(원|won|개)?/gi, ''));

// Payment and order-confirm controls. Learning, testing and replaying an order never need them. A label is one
// when, bare, it is such an action, starts with a payment word, or ends with an order or pay verb. Matching whole
// labels, not substrings (I-193): "계속 주문하기" on a timeout modal keeps the order going and must be tappable.
const PAY_EXACT = ['주문', '주문하기', '주문완료', '결제', '결제하기', '카드', '카드결제', '간편결제', '신용카드', '체크카드', '신용체크카드',
  '쿠폰', '상품권', '구매하기', 'order', 'ordernow', 'placeorder', 'submitorder', 'confirmorder', 'completeorder', 'pay', 'paynow',
  'payment', 'checkout', 'card', 'creditcard', 'buynow'];
const PAY_START = ['결제', 'pay', 'checkout'];
const PAY_END = ['주문하기', '결제하기', '구매하기', '주문완료', '결제', 'checkout', 'ordernow', 'placeorder', 'paynow', 'payment'];
// A keep-ordering word frees a label from the order words, but not from the payment ones ("Continue to payment").
const KEEP_ORDERING = ['계속', '더담기', '취소', '이전', 'continue', 'back', 'cancel'];
const PAYMENT = ['결제', '카드', 'pay', 'card', 'checkout'];
const isPayAction = (t) => !!t && (PAY_EXACT.includes(t) || PAY_START.some((w) => t.startsWith(w)) || PAY_END.some((w) => t.endsWith(w)));

// text may hold several lines (a control's label and its inner text); extra is the skill's forbiddenLabels, matched
// as whole labels. The one rule for the driver, runner, audit, lint and the blind-kiosk grader.
export const isForbidden = (text, extra = []) => {
  const lines = String(text ?? '').split('\n').filter((l) => norm(l));
  const own = (extra ?? []).map(norm).filter(Boolean);
  if (lines.some((l) => own.includes(norm(l)) || own.includes(bare(l)))) return true;
  const all = bare(lines.join(' '));
  if (KEEP_ORDERING.some((w) => all.includes(w))) return PAYMENT.some((w) => all.includes(w));
  return lines.some((l) => isPayAction(bare(l)));
};

// A payment control the kiosk shows (결제하기, 카드 결제, Pay): what must still lie ahead after the order review opens.
export const isPaymentControl = (label) => isForbidden(label) && PAYMENT.some((w) => bare(label).includes(w));

// The one exception to isForbidden (round 3, I-195): the kiosk's order button may be tapped to open its order review,
// where the kiosk shows the total it will charge before payment. Only with the op "openReview", only on a label that is
// exactly an order word (a price or count may follow), never one that also names payment or sending, and never one in
// the skill's own forbiddenLabels. The runner then checks that a payment step appeared (runner.mjs).
const REVIEW_OPENERS = ['주문', '주문하기', 'order'];
const NOT_A_REVIEW = [...PAYMENT, '쿠폰', '상품권', '완료', '전송', '접수', '확정', 'submit', 'send', 'place', 'confirm', 'complete', 'now'];
export const isReviewOpener = (text, extra = []) => {
  const lines = String(text ?? '').split('\n').filter((l) => norm(l));
  if (!lines.length || !REVIEW_OPENERS.includes(bare(lines[0]))) return false;
  const own = (extra ?? []).map(norm).filter(Boolean);
  if (lines.some((l) => own.includes(norm(l)) || own.includes(bare(l)))) return false;
  const all = bare(lines.join(' '));
  return !NOT_A_REVIEW.some((w) => all.includes(w));
};

// Splits an order line's option names over the item's groups, in the skill's group order. A name repeated n times
// is chosen n times (a quantity option). Each name goes to the first group at or after the previous one that has it.
export function optionPlan(groups = [], options = []) {
  const plan = groups.map((g) => ({ name: g.name, select: g.select, after: g.after, picked: [] }));
  let cursor = 0;
  for (const name of options) {
    const has = (g) => (g.options ?? []).some((o) => o.name === name);
    let j = groups.findIndex((g, i) => i >= cursor && has(g));
    if (j < 0) j = groups.findIndex(has);
    if (j < 0) throw new Error(`option not in the item: ${name}`);
    plan[j].picked.push(name);
    cursor = j;
  }
  return plan;
}

// Ops: click, check, clickIfVisible (one target each); forEach (over an array var), repeat (times),
// chooseOptions (per option group of the line's item: the group's own "select" steps for each picked option,
// or the op's steps; then the group's "after" steps, e.g. a wizard's "다음").
export function planSteps(steps, vars, out = []) {
  for (const s of steps ?? []) {
    if (s.op === 'forEach') {
      for (const v of vars[s.over] ?? []) planSteps(s.steps, { ...vars, [s.as]: v }, out);
    } else if (s.op === 'repeat') {
      const n = Math.min(Number(fill(String(s.times), vars)) || 0, 50);
      for (let i = 0; i < n; i++) planSteps(s.steps, vars, out);
    } else if (s.op === 'chooseOptions') {
      for (const g of optionPlan(vars.groups, vars.options)) {
        for (const option of g.picked) planSteps(g.select ?? s.steps, { ...vars, option }, out);
        planSteps(g.after, vars, out);
      }
    } else {
      out.push(fillStep(s, vars));
    }
  }
  return out;
}

// The variables a line's recipe sees: the line, qtyMinus1 and the catalog item's option groups (for chooseOptions).
export function lineVars(skill, line) {
  const item = (skill.catalog ?? []).find((c) => c.name === line.item);
  return { ...line, qtyMinus1: line.qty - 1, groups: item?.optionGroups ?? [] };
}

// Every step one order would take, in order: startOrder, then each line's recipe.
export function orderPlan(skill, order) {
  const out = planSteps(skill.recipes?.startOrder, { dineOption: order.dineOption });
  for (const l of order.lines) {
    const item = (skill.catalog ?? []).find((c) => c.name === l.item);
    planSteps(skill.recipes?.[item?.recipe ?? 'addToCart'], lineVars(skill, l), out);
  }
  return out;
}

// The targets of every step a replay may click that break the payment rule, found before the first click: order
// steps, interrupt answers and the review's close steps that isForbidden refuses, any openReview outside review.open,
// and an openReview (or a second one) that is not the order button.
export function unsafeTargets(skill, order) {
  const f = skill.forbiddenLabels;
  const targets = (s) => [s.label, s.name, s.text].filter(Boolean);
  const forbidden = (s) => s.op === 'openReview' || targets(s).some((t) => isForbidden(t, f));
  const open = planSteps(skill.review?.open ?? [], {});
  const openers = open.filter((s) => s.op === 'openReview');
  const bad = [
    ...orderPlan(skill, order).filter(forbidden),
    ...(skill.interrupts ?? []).map((i) => i?.dismiss).filter(Boolean).filter(forbidden),
    ...open.filter((s) => (s.op === 'openReview' ? !targets(s).every((t) => isReviewOpener(t, f)) : forbidden(s))),
    ...openers.slice(1),
    ...planSteps(skill.review?.close ?? [], {}).filter(forbidden),
  ];
  return bad.map((s) => targets(s)[0] ?? s.op);
}

// Option groups of orderable items that no order in `orders` exercised: { group, item, priced } in catalog order.
// Groups with the same name, options and deltas on several items count once. A group with priced options counts only
// when an order picked a priced one: a 0원 pick cannot show that a price is wrong (I-197).
export function uncoveredGroups(skill, orders) {
  const priced = (g) => (g.options ?? []).some((o) => (o.priceDelta ?? 0) !== 0);
  const sig = (g) => JSON.stringify([g.name, (g.options ?? []).map((o) => [o.name, o.priceDelta ?? 0])]);
  const all = new Map();
  for (const it of skill.catalog ?? []) {
    if (it.soldOut) continue;
    for (const g of it.optionGroups ?? []) {
      if ((g.options ?? []).length && !all.has(sig(g))) all.set(sig(g), { group: g.name, item: it.name, priced: priced(g) });
    }
  }
  const used = new Set();
  for (const o of orders ?? []) {
    for (const l of o.lines ?? []) {
      const groups = (skill.catalog ?? []).find((c) => c.name === l.item)?.optionGroups ?? [];
      let plan;
      try { plan = optionPlan(groups, l.options ?? []); } catch { continue; }
      plan.forEach((p, j) => {
        const g = groups[j];
        const delta = (name) => (g.options ?? []).find((x) => x.name === name)?.priceDelta ?? 0;
        if (p.picked.some((name) => !priced(g) || delta(name) !== 0)) used.add(sig(g));
      });
    }
  }
  return [...all].filter(([k]) => !used.has(k)).map(([, v]) => v);
}
