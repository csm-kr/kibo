// Shared browser driver for the learner (LLM explores) and the runner (no LLM, replays a skill).
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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
const MARK_CLICKABLES = () => {
  const out = [];
  document.querySelectorAll('[data-kibo-label]').forEach((e) => e.removeAttribute('data-kibo-label'));
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const clickable = s.cursor === 'pointer' || el.onclick || ['BUTTON', 'A', 'INPUT', 'LABEL'].includes(el.tagName);
    if (!clickable || (el.parentElement && el.parentElement.closest('[data-kibo-label]'))) continue;
    // Tiles mix an emoji line, a "NEW" badge, the name and a price. The name is what a person reads
    // first: the most prominent text (largest font, bold wins ties) that has letters and is not a price.
    // Icon-only controls fall back to aria-label/title, then the symbol itself.
    let label = '', best = -1;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!/\p{L}/u.test(t) || /^[+\-]?[\d,]+\s*원$/.test(t) || !n.parentElement.getClientRects().length) continue;
      const ps = getComputedStyle(n.parentElement);
      const score = parseFloat(ps.fontSize) * (Number(ps.fontWeight) >= 600 ? 1.2 : 1);
      if (score > best) { best = score; label = t; }
    }
    const lines = (el.innerText || el.value || '').split('\n').map((l) => l.trim()).filter(Boolean);
    label = label || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || lines[0] || '';
    if (!label) continue;
    el.setAttribute('data-kibo-label', label);
    out.push(label);
  }
  return out;
};

export async function snapshot(page, alerts) {
  const tree = await page.locator('body').ariaSnapshot();
  const labels = await page.evaluate(MARK_CLICKABLES);
  const a = alerts.splice(0);
  return (a.length ? `ALERT: ${a.join(' | ')}\n` : '') + tree + `\nTAPPABLE LABELS: ${JSON.stringify(labels)}`;
}

async function locate(page, step) {
  if (step.label) {
    await page.evaluate(MARK_CLICKABLES);
    return page.locator(`[data-kibo-label="${step.label.replace(/"/g, '\\"')}"]`);
  }
  if (step.role) return page.getByRole(step.role, { name: step.name, exact: step.exact ?? false });
  return page.getByText(step.text, { exact: step.exact ?? false });
}

// One primitive step. Ops: click, check, clickIfVisible. Target by label (preferred), role+name, or text.
export async function act(page, step) {
  const loc = await locate(page, step);
  if (step.op === 'clickIfVisible') {
    if (await loc.count() && await loc.first().isVisible()) await loc.first().click({ timeout: 2000 });
    return;
  }
  if (step.op === 'check') return loc.check({ timeout: 3000 });
  return loc.click({ timeout: 3000 });
}

const fill = (v, vars) => typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : v;
const fillStep = (s, vars) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v : fill(v, vars)]));

// Executes a recipe (list of steps with {placeholders}). Control ops: forEach (over an array var), repeat.
export async function runSteps(page, steps, vars) {
  for (const s of steps) {
    if (s.op === 'forEach') {
      for (const v of vars[s.over] ?? []) await runSteps(page, s.steps, { ...vars, [s.as]: v });
    } else if (s.op === 'repeat') {
      const n = Number(fill(String(s.times), vars));
      for (let i = 0; i < n; i++) await runSteps(page, s.steps, vars);
    } else {
      await act(page, fillStep(s, vars));
    }
  }
}
