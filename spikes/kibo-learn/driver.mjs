// Shared browser driver for the learner (LLM explores) and the runner (no LLM, replays a skill).
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { planSteps, isForbidden } from './plan.mjs';

export const KIOSK_URL = process.env.KIOSK_URL ?? pathToFileURL(path.resolve('kiosk/index.html')).href;

export async function openKiosk() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1600 } });
  const alerts = [];
  // Kiosks often use native alert() for errors; capture the text so the agent can read it.
  page.on('dialog', (d) => { alerts.push(d.message()); d.dismiss(); });
  // Read at call time so one process (tests, audit) can open different kiosks.
  await page.goto(process.env.KIOSK_URL ?? KIOSK_URL);
  return { browser, page, alerts };
}

// Real kiosks are full of clickable <div> tiles with no role. The aria tree merges their text
// ("콜라2,000원"), so text matching is ambiguous. We mark every visible clickable element and
// expose its first text line as a "label": the word a human would read on the tile.
// Returns [{ label, near }]: near is the closest text around the element that is not its own label,
// so repeated labels ("+" in every stepper row) can be told apart with "within".
// Keep in step with src/lib/bridge/labels.ts, which replays skills in the product.
const MARK_CLICKABLES = () => {
  const out = [];
  // Toggles and tabs are often <div role="radio"> with a listener and no pointer cursor (pattern 8).
  const ROLES = '[role=button],[role=radio],[role=checkbox],[role=tab],[role=option],[role=switch],[role=menuitem],[role=link]';
  const PRICE = /^[+\-]?[\d,]+\s*원$/;
  document.querySelectorAll('[data-kibo-label]').forEach((e) => e.removeAttribute('data-kibo-label'));
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const clickable = s.cursor === 'pointer' || el.onclick || ['BUTTON', 'A', 'INPUT', 'LABEL'].includes(el.tagName) || el.matches(ROLES);
    if (!clickable || (el.parentElement && el.parentElement.closest('[data-kibo-label]'))) continue;
    // Tiles mix an emoji line, a "NEW" badge, the name and a price. The name is what a person reads
    // first: the most prominent text (largest font, bold wins ties) that has letters and is not a price.
    // Icon-only controls fall back to aria-label/title, then the symbol itself.
    let label = '', best = -1;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!/\p{L}/u.test(t) || PRICE.test(t) || !n.parentElement.getClientRects().length) continue;
      const ps = getComputedStyle(n.parentElement);
      const score = parseFloat(ps.fontSize) * (Number(ps.fontWeight) >= 600 ? 1.2 : 1);
      if (score > best) { best = score; label = t; }
    }
    const lines = (el.innerText || el.value || '').split('\n').map((l) => l.trim()).filter(Boolean);
    label = label || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || lines[0] || '';
    if (!label) continue;
    el.setAttribute('data-kibo-label', label);
    let near = '';
    for (let a = el.parentElement; a && !near; a = a.parentElement) {
      near = (a.innerText || '').split('\n').map((l) => l.trim())
        .find((l) => /\p{L}/u.test(l) && l !== label && !PRICE.test(l)) ?? '';
    }
    out.push({ label, near });
  }
  return out;
};

// Smaller screen trees for the model (token budget, pattern 2): drops lines that carry no name a step could use
// (unnamed or emoji-only images, separators, link urls) and folds runs of identical lines into one "(×n)".
// The TAPPABLE LABELS and REPEATED LABELS lines are kept as they are.
export function compactTree(snap) {
  const out = [];
  let last = null, count = 0;
  const flush = () => { if (last !== null) out.push(count > 1 ? `${last} (×${count})` : last); };
  for (const line of snap.split('\n')) {
    const img = line.match(/^\s*- img(?: "([^"]*)")?:?$/);
    if ((img && !/[\p{L}\p{N}]/u.test(img[1] ?? '')) || /^\s*- separator\b/.test(line) || /^\s*- \/url:/.test(line)) continue;
    if (line === last && !/^(TAPPABLE|REPEATED) LABELS:/.test(line)) { count++; continue; }
    flush();
    last = line; count = 1;
  }
  flush();
  return out.join('\n');
}

function repeatedLine(marks) {
  const by = new Map();
  for (const m of marks) by.set(m.label, [...(by.get(m.label) ?? []), m.near]);
  const rep = [...by].filter(([, near]) => near.length > 1)
    .map(([label, near]) => `${JSON.stringify(label)} ×${near.length} near [${near.join(' | ')}]`);
  return rep.length ? `\nREPEATED LABELS: ${rep.join('; ')} (add "within": "<text near the one you mean>" to a step)` : '';
}

export async function snapshot(page, alerts) {
  const tree = await page.locator('body').ariaSnapshot();
  const marks = await page.evaluate(MARK_CLICKABLES);
  const a = alerts.splice(0);
  return compactTree((a.length ? `ALERT: ${a.join(' | ')}\n` : '') + tree
    + `\nTAPPABLE LABELS: ${JSON.stringify(marks.map((m) => m.label))}` + repeatedLine(marks));
}

// Marks the one element a label step means with data-kibo-pick. With "within", among the elements with that
// label, the ones whose nearest ancestor holding the "within" text is closest win (the + in the shot's own row).
const PICK_LABEL = ({ label, within }) => {
  document.querySelectorAll('[data-kibo-pick]').forEach((e) => e.removeAttribute('data-kibo-pick'));
  const all = [...document.querySelectorAll('[data-kibo-label]')];
  const els = all.filter((e) => e.getAttribute('data-kibo-label') === label);
  const nearOf = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const l = (a.innerText || '').split('\n').map((x) => x.trim()).find((x) => /\p{L}/u.test(x) && x !== label && !/^[+\-]?[\d,]+\s*원$/.test(x));
      if (l) return l;
    }
    return '';
  };
  let pick = els;
  if (within) {
    const dist = (el) => { let d = 0; for (let a = el; a; a = a.parentElement, d++) if ((a.innerText || '').includes(within)) return d; return Infinity; };
    const ds = els.map(dist);
    const m = Math.min(...ds);
    pick = m === Infinity ? [] : els.filter((_, i) => ds[i] === m);
  }
  if (pick.length === 1) pick[0].setAttribute('data-kibo-pick', '');
  const similar = els.length ? [] : [...new Set(all.map((e) => e.getAttribute('data-kibo-label')).filter((l) => l.includes(label) || label.includes(l)))].slice(0, 8);
  return { count: els.length, picked: pick.length, near: els.map(nearOf), similar };
};

// Returns a locator for exactly one element, or throws an error that says how to fix the step.
async function locate(page, step) {
  if (step.label) {
    await page.evaluate(MARK_CLICKABLES);
    const r = await page.evaluate(PICK_LABEL, { label: step.label, within: step.within });
    if (r.picked === 1) return page.locator('[data-kibo-pick]');
    if (!r.count) return { missing: `no tappable label ${JSON.stringify(step.label)} on this screen${r.similar.length ? `; labels containing it: ${JSON.stringify(r.similar)}` : ''}` };
    if (step.within && !r.picked) return { missing: `no ${JSON.stringify(step.label)} near ${JSON.stringify(step.within)}` };
    throw new Error(`label ${JSON.stringify(step.label)} matches ${r.count} elements (near: ${r.near.join(' | ')}); add "within": "<text near the one you mean>"`);
  }
  const loc = step.role ? page.getByRole(step.role, { name: step.name, exact: step.exact ?? false }) : page.getByText(step.text, { exact: step.exact ?? false });
  let hits = await loc.all();
  if (step.within) {
    const ds = await Promise.all(hits.map((h) => h.evaluate((el, w) => { let d = 0; for (let a = el; a; a = a.parentElement, d++) if ((a.innerText || '').includes(w)) return d; return 1e9; }, step.within)));
    const m = Math.min(...ds);
    hits = m >= 1e9 ? [] : hits.filter((_, i) => ds[i] === m);
  }
  if (hits.length === 1) return hits[0];
  if (!hits.length) return { missing: `nothing matches ${JSON.stringify(step)} on this screen` };
  throw new Error(`${JSON.stringify(step)} matches ${hits.length} elements; add "within": "<text near the one you mean>" or "exact": true`);
}

const describe = (s) => [s.label, s.name, s.text].find(Boolean);

// One primitive step. Ops: click, check, clickIfVisible. Target by label (preferred), role+name, or text, optionally
// narrowed by "within". A payment or checkout control is never clicked (isForbidden in plan.mjs, plus opts.forbidden).
export async function act(page, step, opts = {}) {
  const refuse = (what) => new Error(`Refused: ${JSON.stringify(what)} is a payment or checkout control; a skill never needs it (list it in forbiddenLabels)`);
  if (describe(step) && isForbidden(describe(step), opts.forbidden)) throw refuse(describe(step));
  let loc = await locate(page, step);
  if (loc.missing && step.op === 'clickIfVisible') return;
  // The target may still be appearing (an animation, a dialog): look again for up to 3 s, as a click would wait.
  for (const t0 = Date.now(); loc.missing && Date.now() - t0 < 3000;) {
    await page.waitForTimeout(150);
    loc = await locate(page, step);
  }
  if (loc.missing) throw new Error(loc.missing);
  const text = await loc.evaluate((el) => `${el.getAttribute('data-kibo-label') ?? ''}\n${el.innerText ?? ''}`);
  if (isForbidden(text, opts.forbidden)) throw refuse(text.trim().split('\n')[0]);
  if (step.op === 'clickIfVisible') return loc.click({ timeout: 2000 });
  if (step.op === 'check') return loc.check({ timeout: 3000 });
  return loc.click({ timeout: 3000 });
}

// Executes a recipe (list of steps with {placeholders}): the whole plan is expanded first (plan.mjs), then each
// step runs in order. Control ops: forEach, repeat, chooseOptions.
export async function runSteps(page, steps, vars, opts = {}) {
  for (const s of planSteps(steps, vars)) await act(page, s, opts);
}
