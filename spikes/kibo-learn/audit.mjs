// Coverage audit, no AI: walks the kiosk with the skill's own start recipe and checks that every
// priced tile on the menu screens is in the catalog. Labels the learner declared as plain controls
// (uiLabels) are clicked on a fresh page; if priced tiles appear behind one, it was a hidden category.
import { openKiosk, runSteps, act, snapshot } from './driver.mjs';

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
  })));
}

async function freshMenu(skill) {
  const k = await openKiosk();
  const dine = Object.values(skill.dineOptions ?? {})[0];
  await runSteps(k.page, skill.recipes.startOrder, { dineOption: dine });
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
  const known = (label) => [...items, ...cats, ...ui].some((k) => same(label, k));
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
  for (const t of base.filter((b) => !b.priced && ui.some((u) => same(b.label, u)))) {
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
  return { ok, missingItems, unknownLabels, hiddenUnder, checkedCategories: cats.length, labelsSeen: seen.size };
}

if (process.argv[1].split('/').pop() === 'audit.mjs') {
  const fs = await import('node:fs');
  const skill = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(await audit(skill), null, 1));
}
