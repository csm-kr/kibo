// AI-free checks of a learned skill's shape, run by testSkill and finish (learner.mjs). Each message says what to
// change. Written from the blind-kiosk failure patterns (spikes/blind-kiosks/results/BASELINE.md 1, 3, 6, 9).
import { isForbidden, planSteps } from './plan.mjs';

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
  for (const [name, steps] of Object.entries(recipes)) {
    // Expanded with placeholders left in, so only the recipe's own fixed labels are checked here.
    let plain = [];
    try { plain = planSteps(steps, { options: [], groups: [] }); } catch { /* chooseOptions with no options is empty */ }
    const bad = plain.map((s) => [s.label, s.name, s.text].find((t) => t && isForbidden(t, skill.forbiddenLabels))).filter(Boolean);
    if (bad.length) errors.push(`recipe "${name}" clicks a payment or checkout control (${bad.join(', ')}); a skill only adds to the cart.`);
  }
  return errors;
}
