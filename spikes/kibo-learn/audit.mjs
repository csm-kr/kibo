// Coverage audit, no AI: walks the kiosk with the skill's own start recipe and checks that every
// priced tile on the menu screens is in the catalog. Labels the learner declared as plain controls
// (uiLabels) are clicked on a fresh page; if priced tiles appear behind one, it was a hidden category.
import { openKiosk, runSteps, act, snapshot } from './driver.mjs';
import { isForbidden } from './plan.mjs';

const norm = (s) => String(s).replace(/\s/g, '');
// "라지" matches "라지 (+500원)" but not "라지세트".
export const same = (n, want) => norm(n) === norm(want) || (norm(n).startsWith(norm(want)) && !/^[가-힣A-Za-z]/.test(norm(n).slice(norm(want).length)));
const PAGER = /^[›>→▶❯»]$|^다음$|^next$/i;      // clicked to see more items
const PAGER_ANY = /^[‹<←◀❮«›>→▶❯»]$|^(이전|다음|prev|next)$/i; // never an item or category
const MAX_PAGES = 6;

async function tappables(page, alerts) {
  await snapshot(page, alerts); // marks clickables with data-kibo-label
  return page.$$eval('[data-kibo-label]', (els) => els.map((e) => ({
    label: e.getAttribute('data-kibo-label'),
    text: e.innerText || '',
    priced: /\d[\d,]*\s*원|[$€£]\s?\d/.test(e.innerText || ''),
    // A customer choice in an item's sheet: a radio or checkbox (native or by role), or a price change ("+500원").
    choice: !!(e.matches('input[type=radio],input[type=checkbox]') || e.querySelector('input[type=radio],input[type=checkbox]')
      || ['radio', 'checkbox', 'option', 'switch'].includes(e.getAttribute('role'))) || /[+＋]\s*[\d,]+\s*원/.test(e.innerText || ''),
  })));
}

// Opens every item that is not sold out and lists the choices on its first screen that none of its option groups
// name (a shallow catalog: a whole topping group left out). Informational: it does not fail the audit.
async function optionGaps(skill) {
  const gaps = {};
  const dine = Object.values(skill.dineOptions ?? {})[0];
  const opts = { forbidden: skill.forbiddenLabels };
  const k = await freshMenu(skill);
  try {
    for (const item of (skill.catalog ?? []).filter((c) => !c.soldOut)) {
      try {
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
        if (!tile) continue;
        await act(k.page, { op: 'click', label: tile.label }, opts);
        await k.page.waitForTimeout(250);
        const before = new Set(menu.map((t) => t.label));
        const names = (item.optionGroups ?? []).flatMap((g) => (g.options ?? []).map((o) => o.name));
        const missing = (await tappables(k.page, k.alerts))
          .filter((t) => t.choice && !before.has(t.label) && !names.some((n) => same(t.label, n) || same(n, t.label)))
          .map((t) => t.label);
        if (missing.length) gaps[item.name] = [...new Set(missing)];
      } catch { /* an item that cannot be opened here is the testSkill's job */ }
      await k.page.reload();
      await runSteps(k.page, skill.recipes?.startOrder, { dineOption: dine }, opts);
    }
  } finally { await k.browser.close(); }
  return gaps;
}

// A start recipe that fails must not leave its browser open: it would keep the learner's process alive (I-187).
async function freshMenu(skill) {
  const k = await openKiosk();
  const dine = Object.values(skill.dineOptions ?? {})[0];
  try {
    await runSteps(k.page, skill.recipes?.startOrder, { dineOption: dine }, { forbidden: skill.forbiddenLabels });
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

  const ok = !missingItems.length && !unknownLabels.length && !Object.keys(hiddenUnder).length;
  const missingOptions = await optionGaps(skill);
  return { ok, missingItems, unknownLabels, hiddenUnder, missingOptions, checkedCategories: cats.length, labelsSeen: seen.size };
}

if (process.argv[1].split('/').pop() === 'audit.mjs') {
  const fs = await import('node:fs');
  const skill = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(await audit(skill), null, 1));
}
