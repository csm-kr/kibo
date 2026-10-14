// AI-free checks of a learned skill's shape, run by testSkill and finish (learner.mjs). Each message says what to
// change. Written from the blind-kiosk failure patterns (spikes/blind-kiosks/results/BASELINE.md 1, 3, 6, 9).
import { isForbidden, isReviewOpener, planSteps } from './plan.mjs';

// Wizard and sheet controls recorded as if they were choices (pattern 6), and stepper button text (pattern 1).
const NAVIGATION = /^(다음|이전|확인|취소|닫기|담기|완료|선택|뒤로|처음으로|next|prev|previous|back|ok|cancel|close|done|add)$/i;
const STEPPER = /(더하기|빼기|증가|감소)$/;

export function lintSkill(skill) {
  const errors = [];
  const recipes = skill.recipes ?? {};
  for (const item of skill.catalog ?? []) {
    const where = (g) => `${item.name} › ${g.name}`;
    if (item.recipe && !Array.isArray(recipes[item.recipe])) errors.push(`${item.name}: recipe "${item.recipe}" is not in recipes`);
    const groups = item.optionGroups ?? [];
    for (const g of groups) {
      for (const o of g.options ?? []) {
        const n = String(o.name ?? '').trim();
        if (!/\p{L}/u.test(n) || NAVIGATION.test(n) || STEPPER.test(n)) {
          errors.push(`${where(g)}: option "${n}" is a control (navigation or a stepper button), not a customer choice. `
            + 'Name the choice itself; a "−/+" count is a group with "type":"quantity" and "select" steps; a wizard\'s 다음 goes in the group\'s "after" steps.');
        }
      }
      if (g.type === 'quantity') {
        if (!Array.isArray(g.select) || !g.select.length) errors.push(`${where(g)}: quantity group "${g.name}" needs "select": the steps that add one of {option} (e.g. the + in its row: {"op":"click","label":"+","within":"{option}"}).`);
        for (const o of g.options ?? []) if (!(Number.isInteger(o.maxQty) && o.maxQty >= 1)) errors.push(`${where(g)}: quantity option "${o.name}" needs "maxQty" (the largest count the stepper allows).`);
      }
      if (g.appliesWhen != null) {
        const [gName, oName] = String(g.appliesWhen).split('=').map((s) => s.trim());
        const other = groups.find((x) => x !== g && x.name === gName);
        if (!other || !(other.options ?? []).some((o) => o.name === oName)) {
          errors.push(`${where(g)}: appliesWhen "${g.appliesWhen}" must be "<other group name>=<one of its option names>" of the same item.`);
        }
      }
    }
  }
  const groupSteps = (skill.catalog ?? []).flatMap((it) => (it.optionGroups ?? []).map((g) => [`${it.name} › ${g.name}`, [...(g.select ?? []), ...(g.after ?? [])]]));
  for (const [name, steps] of [...Object.entries(recipes).map(([n, st]) => [`recipe "${n}"`, st]), ...groupSteps]) {
    // Expanded with placeholders left in, so only the recipe's own fixed labels are checked here.
    let plain = [];
    try { plain = planSteps(steps, { options: [], groups: [] }); } catch { /* chooseOptions with no options is empty */ }
    const bad = plain.map((s) => [s.label, s.name, s.text].find((t) => t && isForbidden(t, skill.forbiddenLabels))).filter(Boolean);
    if (bad.length) errors.push(`${name} clicks a payment or checkout control (${bad.join(', ')}); a skill only adds to the cart.`);
    if (plain.some((s) => s.op === 'openReview')) errors.push(`${name}: openReview may be used only in review.open (the kiosk's order button that opens its order review).`);
  }
  errors.push(...interruptErrors(skill), ...reviewErrors(skill), ...chargeErrors(skill));
  return errors;
}

const target = (s) => [s?.label, s?.name, s?.text].find(Boolean);
const letters = (t) => String(t ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');

// Popups that can come up between any two steps (I-194): the runner answers them before each step, so the answer
// must keep the order going without ordering, paying or adding anything, and the text must identify the popup.
function interruptErrors(skill) {
  const errors = [];
  const names = [...(skill.categories ?? []), ...(skill.catalog ?? []).flatMap((it) => [it.name, it.category,
    ...(it.optionGroups ?? []).flatMap((g) => (g.options ?? []).map((o) => o.name))])].map(letters).filter(Boolean);
  for (const it of skill.interrupts ?? []) {
    const what = `interrupt "${it?.text ?? ''}"`;
    if (letters(it?.text).length < 4) errors.push(`${what}: its text must identify the popup: a phrase of at least 4 letters shown only on it.`);
    const t = target(it?.dismiss);
    if (!t) { errors.push(`${what}: "dismiss" needs one step with a label, e.g. {"op":"click","label":"<the button that keeps the order>"}.`); continue; }
    if (it.dismiss.op === 'openReview' || isForbidden(t, skill.forbiddenLabels)) {
      errors.push(`${what}: its dismiss step clicks a payment or checkout control (${t}); answer it with the button that keeps the order going.`);
    }
    if (names.includes(letters(t))) errors.push(`${what}: its dismiss label "${t}" is an item, category or option; answering the popup must not add to the order.`);
  }
  return errors;
}

// The order review (I-195): reached from the menu with the order button (openReview, at most once), never a payment
// control; its total is read with totalPattern.
function reviewErrors(skill) {
  const r = skill.review;
  if (r == null) return [];
  if (!Array.isArray(r.open) || !r.open.length) return ['review: "open" must list the steps from the menu (cart full) to the order review, with {"op":"openReview","label":"<order button>"}.'];
  const errors = [];
  let open = [], close = [];
  try { open = planSteps(r.open, {}); close = planSteps(r.close ?? [], {}); } catch (e) { return [`review: ${e.message}`]; }
  const openers = open.filter((s) => s.op === 'openReview');
  if (openers.length > 1) errors.push('review: open may tap the order button (openReview) only once.');
  for (const s of openers) {
    if (!isReviewOpener(target(s), skill.forbiddenLabels)) {
      errors.push(`review: openReview "${target(s)}" is not the order button. Only the kiosk's order button (주문하기, Order) may open the review, never a payment, send or forbiddenLabels control.`);
    }
  }
  const bad = [...open.filter((s) => s.op !== 'openReview'), ...close].map(target).filter((t) => t && isForbidden(t, skill.forbiddenLabels));
  if (bad.length) errors.push(`review: it clicks a payment or checkout control (${bad.join(', ')}); the review is only read, then closed with a back button.`);
  if (close.some((s) => s.op === 'openReview')) errors.push('review: close may not use openReview.');
  let groups = 0;
  try { groups = new RegExp(`${r.totalPattern}|`).exec('').length - 1; } catch { /* invalid */ }
  if (typeof r.totalPattern !== 'string' || groups < 1) errors.push('review: "totalPattern" must be a JS regex whose group 1 is the total shown on the review.');
  return errors;
}

// Charges the kiosk adds once per order (take-out container, service): a whole amount, for one dine choice if named.
function chargeErrors(skill) {
  const dine = Object.values(skill.dineOptions ?? {});
  return (skill.charges ?? []).flatMap((c) => [
    ...(typeof c?.name === 'string' && c.name.trim() ? [] : ['charges: every charge needs a "name" as the kiosk shows it.']),
    ...(Number.isInteger(c?.amount) && c.amount !== 0 ? [] : [`charge "${c?.name}": "amount" must be a whole number of won, not 0.`]),
    ...(c?.dineOption == null || dine.includes(c.dineOption) ? [] : [`charge "${c?.name}": dineOption "${c.dineOption}" must be one of the dineOptions labels (${dine.join(', ')}).`]),
  ]);
}
