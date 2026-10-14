// Coverage audit, no AI: walks the kiosk with the skill's own start recipe and checks that every
// priced tile on the menu screens is in the catalog. Labels the learner declared as plain controls
// (uiLabels) are clicked on a fresh page; if priced tiles appear behind one, it was a hidden category.
// Round 4: it also replays the simplest line of each kind of item and fails a recipe that taps one of several
// look-alike choices for the customer (hardClicks), and an item the kiosk will not add while the skill leaves out a
// choice its screen shows (requiredChoices).
import { openKiosk, runSteps, act, snapshot, answerInterrupts, kioskViewport, lookAlikes, newTappables, KIOSK_URL } from './driver.mjs';
import { isForbidden, isControlLabel, isFixedStep, lineVars } from './plan.mjs';
import { expectedTotal } from './runner.mjs';

const norm = (s) => String(s).replace(/\s/g, '');
// "라지" matches "라지 (+500원)" but not "라지세트".
export const same = (n, want) => norm(n) === norm(want) || (norm(n).startsWith(norm(want)) && !/^[가-힣A-Za-z]/.test(norm(n).slice(norm(want).length)));
const PAGER = /^[›>→▶❯»]$|^다음$|^next$/i;      // clicked to see more items
const PAGER_ANY = /^[‹<←◀❮«›>→▶❯»]$|^(이전|다음|prev|next)$/i; // never an item or category
const MAX_PAGES = 6;
// A tappable is a priced tile when an amount on it is not zero. A running total shows 0 on a fresh order ("🧾 주문 내역
// 0원", "주문하기 0원"): a control, not an item (round 4: bk8-tableorder's header total failed every audit as missing).
const AMOUNT = /(\d[\d,]*)\s*원|[$€£]\s?(\d[\d,.]*)/g;
const priced = (text) => [...String(text).matchAll(AMOUNT)].some((m) => Number((m[1] ?? m[2]).replace(/,/g, '')) > 0);
const PRICE_TEXT = /\d[\d,]*\s*원|[$€£]\s?\d/;
// Answers to a yes/no question (an age check, "remove this?") confirm a step; the audit does not count them as the
// customer's choices. A skill may still model a yes/no option group: the lint allows those names.
const ANSWER = /^(예|네|아니오|아니요|yes|no)$/i;
const notChoice = (l, forbidden) => isControlLabel(l) || ANSWER.test(String(l).replace(/[^\p{L}\p{N}]/gu, '')) || isForbidden(l, forbidden);

async function tappables(page, alerts) {
  await snapshot(page, alerts); // marks clickables with data-kibo-label
  return page.$$eval('[data-kibo-label]', (els) => els.map((e) => ({
    label: e.getAttribute('data-kibo-label'),
    text: e.innerText || '',
  }))).then((list) => list.map((t) => ({ ...t, priced: priced(t.text) })));
}

// What the audit saw is kept for the rest of the process (one learning run calls it several times; the kiosk is
// deterministic, PROTOCOL.md builder rule 4): each item's first screen, and each line replay while the recipe, the
// item's groups and the start are the same.
const memo = { screens: new Map(), probes: new Map() };
export function resetAuditMemo() { memo.screens.clear(); memo.probes.clear(); }
const firstDine = (skill) => Object.values(skill.dineOptions ?? {})[0];
const startKey = (skill) => JSON.stringify([process.env.KIOSK_URL ?? KIOSK_URL, kioskViewport(), skill.recipes?.startOrder ?? [],
  firstDine(skill), skill.interrupts ?? [], skill.forbiddenLabels ?? []]);

// Opens one item from the menu and returns the labels its first screen added, and which of them are customer
// choices: a radio or checkbox, a "+n원" label, or one of several look-alike buttons in a row (round 4: plain chips
// with no role and no price, such as a sweetness row 0%–100%). Controls (담기, +, 닫기), payment buttons and disabled
// (sold-out) choices are not counted.
async function readItemScreen(k, item, opts) {
  const tab = (await tappables(k.page, k.alerts)).find((t) => same(t.label, item.category));
  if (tab) { await act(k.page, { op: 'click', label: tab.label }, opts); await k.page.waitForTimeout(150); }
  let menu = await tappables(k.page, k.alerts);
  for (let i = 0; i < MAX_PAGES && !menu.some((t) => same(t.label, item.name)); i++) {
    const pager = menu.find((t) => PAGER.test(t.label.trim()));
    if (!pager) break;
    await act(k.page, { op: 'click', label: pager.label }, opts);
    await k.page.waitForTimeout(150);
    menu = await tappables(k.page, k.alerts);
  }
  const tile = menu.find((t) => same(t.label, item.name));
  if (!tile) return null;
  await act(k.page, { op: 'click', label: tile.label }, opts);
  await k.page.waitForTimeout(250);
  const fresh = await newTappables(k.page, new Set(menu.map((t) => t.label)));
  const control = (l) => notChoice(l, opts.forbidden);
  const isChoice = (t) => !t.disabled && !control(t.label) && (t.choice || t.peers.some((p) => !control(p)));
  return { labels: [...new Set(fresh.map((t) => t.label))], choices: [...new Set(fresh.filter(isChoice).map((t) => t.label))] };
}

async function itemScreens(skill, items, work) {
  const opts = { forbidden: skill.forbiddenLabels, interrupts: skill.interrupts };
  const key = (it) => JSON.stringify([startKey(skill), it.category, it.name]);
  const todo = items.filter((it) => !memo.screens.has(key(it)));
  if (todo.length) {
    const k = await freshMenu(skill);
    try {
      for (const item of todo) {
        let screen = null;
        try { screen = await readItemScreen(k, item, opts); } catch { /* an item that cannot be opened here is the testSkill's job */ }
        memo.screens.set(key(item), screen);
        work.itemScreens++;
        await k.page.reload();
        await runSteps(k.page, skill.recipes?.startOrder, { dineOption: firstDine(skill) }, opts);
      }
    } finally { await k.browser.close(); }
  }
  return new Map(items.map((it) => [it.name, memo.screens.get(key(it))]));
}

// The simplest line of an item: the first option of each required group that applies, quantity 1.
function simplestLine(item) {
  const picked = new Map();
  for (const g of item.optionGroups ?? []) {
    if (!(g.required || (g.min ?? 0) > 0) || !(g.options ?? []).length) continue;
    if (g.appliesWhen != null) {
      const [gName, oName] = String(g.appliesWhen).split('=').map((x) => x.trim());
      if (picked.has(gName) && picked.get(gName) !== oName) continue;
    }
    picked.set(g.name, g.options[0].name);
  }
  return { category: item.category, item: item.name, options: [...picked.values()], qty: 1 };
}

// Replays the simplest line of one item on a fresh kiosk and looks at every step the recipe writes with a fixed label
// (and every interrupt answer) after the item is opened: a tap on one of several look-alike choices is recorded with
// them, where it was (the item's own screen or a popup after it) and whether the popup shows prices. Then reads the
// cart total, which tells whether the kiosk added the line.
async function probeLine(skill, item, screen, categories) {
  const line = simplestLine(item);
  const taps = [];
  let opened = false;
  const inspect = async (page, loc, step, kind) => {
    const t = [step.label, step.name, step.text].find(Boolean);
    if (!opened) { opened = kind === 'step' && !!t && same(t, item.name); return; }
    if ((kind === 'step' && !isFixedStep(step)) || !t || notChoice(t, skill.forbiddenLabels) || categories.some((c) => same(t, c))) return;
    const seen = await lookAlikes(page, loc);
    // Controls, answers and payment buttons are never the customer's alternatives (a timeout modal's "Order now").
    const alternatives = [...new Set(seen.alternatives.map((a) => a.label).filter((l) => l && l !== seen.label && !notChoice(l, skill.forbiddenLabels)))];
    if (!alternatives.length || notChoice(seen.label, skill.forbiddenLabels)) return;
    taps.push({ label: t, where: screen?.labels.includes(seen.label) ? 'item screen' : 'popup', alternatives,
      priced: PRICE_TEXT.test(seen.text) || seen.alternatives.some((a) => PRICE_TEXT.test(a.text)) });
  };
  const opts = { forbidden: skill.forbiddenLabels, interrupts: skill.interrupts, inspect };
  const k = await openKiosk();
  try {
    await runSteps(k.page, skill.recipes?.startOrder, { dineOption: firstDine(skill) }, opts);
    await runSteps(k.page, skill.recipes[item.recipe ?? 'addToCart'], lineVars(skill, line), opts);
    await answerInterrupts(k.page, skill.interrupts, opts);
    await k.page.waitForTimeout(150);
    const total = Number(((await snapshot(k.page, k.alerts)).match(new RegExp(skill.cartTotalPattern)) ?? [])[1]?.replace(/,/g, ''));
    return { line, taps, total: Number.isFinite(total) ? total : null, error: null };
  } catch (e) {
    return { line, taps, total: null, error: e.message.split('\n')[0] };
  } finally { await k.browser.close(); }
}

// One replay per kind of item: same category, recipe, left-out choices and option groups by their shape (names, types,
// conditions and steps; not each option's name and price, which change no fixed step).
async function probeLines(skill, items, screens, missing, work) {
  const kinds = new Map();
  const shape = (g) => [g.name, g.type ?? null, !!(g.required || (g.min ?? 0) > 0), g.appliesWhen ?? null, g.select ?? null, g.after ?? null];
  for (const it of items) {
    if (!Array.isArray(skill.recipes?.[it.recipe ?? 'addToCart'])) continue;
    const kind = JSON.stringify([it.category, it.recipe ?? 'addToCart', (it.optionGroups ?? []).map(shape), missing[it.name] ?? []]);
    kinds.set(kind, [...(kinds.get(kind) ?? []), it]);
  }
  const categories = [...new Set([...(skill.categories ?? []), ...(skill.catalog ?? []).map((c) => c.category)].filter(Boolean))];
  const out = [];
  for (const [kind, members] of kinds) {
    const rep = members[0];
    const key = JSON.stringify([startKey(skill), skill.recipes[rep.recipe ?? 'addToCart'], kind, rep.name, rep.price, rep.optionGroups ?? [], categories,
      skill.cartTotalPattern, screens.get(rep.name)?.labels ?? null]);
    if (!memo.probes.has(key)) { memo.probes.set(key, await probeLine(skill, rep, screens.get(rep.name), categories)); work.lineProbes++; }
    out.push({ members, rep, result: memo.probes.get(key) });
  }
  return out;
}

// A start recipe that fails must not leave its browser open: it would keep the learner's process alive (I-187).
async function freshMenu(skill) {
  const k = await openKiosk();
  const dine = Object.values(skill.dineOptions ?? {})[0];
  try {
    await runSteps(k.page, skill.recipes?.startOrder, { dineOption: dine }, { forbidden: skill.forbiddenLabels, interrupts: skill.interrupts });
  } catch (e) {
    await k.browser.close();
    throw e;
  }
  return k;
}

// Collect tappables on the current screen, following pager arrows while new labels keep appearing.
async function collectPaged(page, alerts, into) {
  for (let i = 0; i < MAX_PAGES; i++) {
    const before = into.size;
    const list = await tappables(page, alerts);
    // Keyed by label + text: two sold-out tiles may share the label "SOLD OUT" but differ in text.
    for (const t of list) into.set(t.label + '\u0000' + t.text, t);
    const pager = list.find((t) => PAGER.test(t.label.trim()));
    if (!pager || (i > 0 && into.size === before)) break;
    try { await act(page, { op: 'click', label: pager.label }); await page.waitForTimeout(150); } catch { break; }
  }
}

export async function audit(skill) {
  const items = (skill.catalog ?? []).map((c) => c.name);
  const cats = [...new Set([...(skill.categories ?? []), ...(skill.catalog ?? []).map((c) => c.category)])];
  const ui = skill.uiLabels ?? [];
  // Payment and checkout controls are never clicked, so they need no other explanation (pattern 3).
  const forbidden = (label) => isForbidden(label, skill.forbiddenLabels);
  const known = (label) => forbidden(label) || [...items, ...cats, ...ui].some((k) => same(label, k));
  const inCatalog = (label) => items.some((k) => same(label, k));

  const seen = new Map();
  let base = [];
  const k = await freshMenu(skill);
  try {
    base = await tappables(k.page, k.alerts);
    await collectPaged(k.page, k.alerts, seen);
    for (const cat of cats) {
      const tab = (await tappables(k.page, k.alerts)).find((t) => same(t.label, cat));
      if (!tab) continue;
      await act(k.page, { op: 'click', label: tab.label });
      await k.page.waitForTimeout(150);
      await collectPaged(k.page, k.alerts, seen);
    }
  } finally { await k.browser.close(); }

  // A priced tile is covered if its label or any line of its text is a catalog name.
  // (Sold-out overlays are often the biggest text on a tile, so the label alone can mislead.)
  const tileInCatalog = (t) => inCatalog(t.label) || t.text.split('\n').some((line) => line.trim() && inCatalog(line.trim()));
  const tiles = [...seen.values()];
  const missingItems = [...new Set(tiles.filter((t) => t.priced && !tileInCatalog(t)).map((t) => t.text.replace(/\s+/g, ' ').trim()))];
  const unknownLabels = [...new Set(tiles.filter((t) => !t.priced && !known(t.label) && !PAGER_ANY.test(t.label.trim())).map((t) => t.label))];

  // Probe labels declared as controls that sit on the first menu screen.
  const hiddenUnder = {};
  for (const t of base.filter((b) => !b.priced && !forbidden(b.label) && ui.some((u) => same(b.label, u)))) {
    const p = await freshMenu(skill);
    try {
      await act(p.page, { op: 'click', label: t.label });
      await p.page.waitForTimeout(200);
      const behind = new Map();
      await collectPaged(p.page, p.alerts, behind);
      const priced = [...behind.values()].filter((b) => b.priced && !(inCatalog(b.label) || b.text.split('\n').some((x) => x.trim() && inCatalog(x.trim())))).map((b) => b.label);
      if (priced.length) hiddenUnder[t.label] = priced;
    } catch { /* a control that navigates away or errors is not a hidden category */ }
    finally { await p.browser.close(); }
  }

  // Each orderable item's own screen: the choices it shows that the item's option groups do not name.
  const work = { itemScreens: 0, lineProbes: 0 };
  const orderable = (skill.catalog ?? []).filter((c) => !c.soldOut);
  const screens = await itemScreens(skill, orderable, work);
  const missingOptions = {};
  for (const item of orderable) {
    const names = (item.optionGroups ?? []).flatMap((g) => (g.options ?? []).map((o) => o.name));
    const gaps = (screens.get(item.name)?.choices ?? []).filter((c) => !names.some((n) => same(c, n) || same(n, c)));
    if (gaps.length) missingOptions[item.name] = gaps;
  }

  // Round 4. A recipe step with a fixed label that taps one of several look-alike choices picks it for every customer:
  // always on the item's own screen; on a popup after it, when the popup shows prices (a set or upsell offer) and the
  // skill does not declare that it always declines it. And an item whose simplest line the kiosk does not add, while
  // its screen shows choices the skill leaves out, needs one of them: a required choice the skill does not model.
  const declined = (label) => (skill.declines ?? []).some((d) => d?.choice && (same(label, d.choice) || same(d.choice, label)));
  const hardClicks = [];
  const requiredChoices = {};
  const failedLines = {};
  for (const { members, rep, result } of await probeLines(skill, orderable, screens, missingOptions, work)) {
    for (const tap of result.taps) {
      if (tap.where === 'popup' && (!tap.priced || declined(tap.label))) continue;
      const had = hardClicks.find((h) => h.label === tap.label && h.where === tap.where);
      if (had) had.items.push(...members.map((m) => m.name));
      else hardClicks.push({ label: tap.label, where: tap.where, alternatives: tap.alternatives, items: members.map((m) => m.name) });
    }
    const order = { dineOption: firstDine(skill), lines: [result.line] };
    let want = [];
    try { want = [expectedTotal(skill, order), expectedTotal({ ...skill, charges: [] }, order)]; } catch { /* item or option not priced */ }
    const why = result.error ? `the simplest order of ${rep.name} failed: ${result.error}`
      : result.total != null && !want.includes(result.total) ? `after the simplest order of ${rep.name} (${want[1]}원) the kiosk's cart total is ${result.total}원` : null;
    if (!why) continue;
    for (const m of members) {
      if (missingOptions[m.name]) requiredChoices[m.name] = { choices: missingOptions[m.name], why };
      else failedLines[m.name] = why;
    }
  }

  const ok = !missingItems.length && !unknownLabels.length && !Object.keys(hiddenUnder).length && !hardClicks.length && !Object.keys(requiredChoices).length;
  return { ok, missingItems, unknownLabels, hiddenUnder, missingOptions, hardClicks, requiredChoices, failedLines, checkedCategories: cats.length, labelsSeen: seen.size, work };
}

if (process.argv[1].split('/').pop() === 'audit.mjs') {
  const fs = await import('node:fs');
  const skill = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(await audit(skill), null, 1));
}
