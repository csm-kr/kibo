// AI-free checks of a learned skill's shape, run by testSkill and finish (learner.mjs). Each message says what to
// change. Written from the blind-kiosk failure patterns (spikes/blind-kiosks/results/BASELINE.md 1, 3, 6, 9).
import { isForbidden, isReviewOpener, planSteps, isControlLabel, isFixedStep } from './plan.mjs';

export function lintSkill(skill) {
  const errors = [];
  const recipes = skill.recipes ?? {};
  // Option name -> "<item> › <group>" (the first that has it), and item and category names.
  const optionOwner = new Map();
  for (const it of skill.catalog ?? []) {
    for (const g of it.optionGroups ?? []) for (const o of g.options ?? []) if (letters(o.name) && !optionOwner.has(letters(o.name))) optionOwner.set(letters(o.name), `${it.name} › ${g.name}`);
  }
  const tileNames = new Set([...(skill.categories ?? []), ...(skill.catalog ?? []).flatMap((it) => [it.name, it.category])].map(letters).filter(Boolean));
  for (const item of skill.catalog ?? []) {
    const where = (g) => `${item.name} › ${g.name}`;
    if (item.recipe && !Array.isArray(recipes[item.recipe])) errors.push(`${item.name}: recipe "${item.recipe}" is not in recipes`);
    const groups = item.optionGroups ?? [];
    for (const g of groups) {
      for (const o of g.options ?? []) {
        // Wizard and sheet controls recorded as if they were choices (pattern 6), stepper buttons (pattern 1), bare
        // symbols. Numbers are choices (0%, 50%, 2; round 4).
        const n = String(o.name ?? '').trim();
        if (isControlLabel(n)) {
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
  for (const [name, steps, line = true] of [...Object.entries(recipes).map(([n, st]) => [`recipe "${n}"`, st, n !== 'startOrder']), ...groupSteps]) {
    // Expanded with placeholders left in, so only the recipe's own fixed labels are checked here.
    let plain = [];
    try { plain = planSteps(steps, { options: [], groups: [] }); } catch { /* chooseOptions with no options is empty */ }
    const bad = plain.map((s) => [s.label, s.name, s.text].find((t) => t && isForbidden(t, skill.forbiddenLabels))).filter(Boolean);
    if (bad.length) errors.push(`${name} clicks a payment or checkout control (${bad.join(', ')}); a skill only adds to the cart.`);
    if (plain.some((s) => s.op === 'openReview')) errors.push(`${name}: openReview may be used only in review.open (the kiosk's order button that opens its order review).`);
    // Round 4: a step written with a fixed label that is a customer choice picks it for every customer (bk7-bubbletea's
    // recipe tapped 50% sweetness on every order). Tiles and tabs (item and category names) are not choices here.
    for (const s of line ? plain.filter(isFixedStep) : []) {
      const t = target(s);
      const of = t && !isControlLabel(t) && !tileNames.has(letters(t)) && optionOwner.get(letters(t));
      if (of) errors.push(`${name} taps "${t}" on every order, a choice of ${of}: the order picks it (chooseOptions or {option}), never the recipe.`);
    }
  }
  const named = new Set((skill.catalog ?? []).flatMap((it) => (it.optionGroups ?? []).map((g) => g.name)));
  for (const [n, st] of Object.entries(recipes)) {
    for (const g of chooseGroups(st)) if (!named.has(g)) errors.push(`recipe "${n}": chooseOptions names group "${g}", which no item has.`);
  }
  errors.push(...interruptErrors(skill), ...reviewErrors(skill), ...chargeErrors(skill), ...declineErrors(skill, optionOwner, tileNames));
  return errors;
}

const chooseGroups = (steps) => (steps ?? []).flatMap((s) => [...(s.op === 'chooseOptions' ? s.groups ?? [] : []), ...chooseGroups(s.steps)]);

// A popup after the add button that changes what is ordered (a set or upsell offer) and that the skill always declines
// (round 4): the button that declines it, and what it offers. The audit accepts that fixed tap only on a popup, never
// on the item's own screen; the grader refuses orders that want the offer.
function declineErrors(skill, optionOwner, tileNames) {
  const tapped = new Set([
    ...Object.entries(skill.recipes ?? {}).filter(([n]) => n !== 'startOrder').flatMap(([, st]) => fixedTargets(st)),
    ...(skill.catalog ?? []).flatMap((it) => (it.optionGroups ?? []).flatMap((g) => fixedTargets([...(g.select ?? []), ...(g.after ?? [])]))),
    ...(skill.interrupts ?? []).map((i) => target(i?.dismiss)).filter(Boolean),
  ].map(letters));
  return (skill.declines ?? []).flatMap((d) => {
    const c = String(d?.choice ?? '').trim();
    const what = `declines "${c}"`;
    if (!c) return ['declines: every entry needs "choice": the button that declines the offer, as the kiosk shows it.'];
    const errors = [];
    if (!String(d.offer ?? '').trim()) errors.push(`${what}: say in "offer" what the popup offers (e.g. "스낵 세트로 변경 -800원"), as the kiosk shows it.`);
    if (isForbidden(c, skill.forbiddenLabels)) errors.push(`${what}: it is a payment or checkout control.`);
    if (optionOwner.has(letters(c))) errors.push(`${what}: it is an option of ${optionOwner.get(letters(c))}; a modelled choice is not declined.`);
    if (tileNames.has(letters(c))) errors.push(`${what}: it is an item or category name.`);
    if (!tapped.has(letters(c))) errors.push(`${what}: no recipe step or interrupt taps it; the recipe must tap it whenever the popup comes up (clickIfVisible).`);
    return errors;
  });
}

function fixedTargets(steps) {
  let plain = [];
  try { plain = planSteps(steps, { options: [], groups: [] }); } catch { /* chooseOptions with no options is empty */ }
  return plain.filter(isFixedStep).map(target).filter(Boolean);
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
