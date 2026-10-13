// Pure recipe expansion, shared by the runner (driver.mjs), the blind-kiosk grader and the tests: placeholders,
// loops and option choosing are resolved before the first click, so a plan can be checked without a browser.

const fill = (v, vars) => (typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : v);
export const fillStep = (s, vars) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v : fill(v, vars)]));

// Payment and order-confirm controls. Learning, testing and replaying an order never need them.
export const FORBIDDEN_WORDS = ['결제', '카드', '간편결제', '쿠폰', '상품권', '주문하기', 'pay', 'card', 'checkout'];
// The same normalization as the blind-kiosk grader (spikes/blind-kiosks/grade/lib.mjs).
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const isForbidden = (text, extra = []) => {
  const t = norm(text ?? '');
  return !!t && [...FORBIDDEN_WORDS, ...extra].map(norm).filter(Boolean).some((w) => t.includes(w));
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
