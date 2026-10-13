import { isForbiddenLabel } from "@/lib/adapters/learned";
import type { RecipeStep } from "@/types/menu";
import { clickables, findByLabel } from "./labels";

// Replays a skill recipe on the kiosk page without AI (ADR-007). planSteps is pure: placeholders, loops and the
// forbidden-label check all happen before the first click. runPlan clicks one located target per step.

/** One option group of the line's item for chooseOptions: the chosen kiosk labels and the group's own steps. */
export interface PlanGroup {
  options: string[];
  select?: RecipeStep[];
  after?: RecipeStep[];
}

export type Vars = Record<string, string | number | string[] | PlanGroup[]>;

export interface PlainStep {
  op: "click" | "check" | "clickIfVisible" | "clickNth";
  label?: string;
  role?: string;
  name?: string;
  text?: string;
  exact?: boolean;
  index?: number;
  within?: string;
}

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeError";
  }
}

/** Repeat counts and line indexes: a quantity is at most 10 and a cart at most 20 lines. */
const MAX_COUNT = 20;
const STEP_TIMEOUT_MS = 3_000;
const POLL_MS = 50;
const QUIET_MS = 50;
const SETTLE_MAX_MS = 300;

function fill(v: string, vars: Vars): string {
  return v.replace(/\{(\w+)\}/g, (_, key: string) => {
    const x = vars[key];
    if (typeof x !== "string" && typeof x !== "number") throw new RecipeError(`No value for {${key}}`);
    return String(x);
  });
}

function count(v: number | string | undefined, vars: Vars): number {
  const n = typeof v === "number" ? v : v === undefined ? NaN : Number(fill(v, vars));
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) throw new RecipeError("Bad repeat count or line index");
  return n;
}

/** Expands forEach, repeat, chooseOptions and {placeholders}; refuses any step aimed at a forbidden (payment) label. */
export function planSteps(steps: RecipeStep[], vars: Vars, forbidden: string[]): PlainStep[] {
  const out: PlainStep[] = [];
  for (const s of steps) {
    if (s.op === "chooseOptions") {
      const groups = vars.groups;
      if (!Array.isArray(groups) || !s.steps) throw new RecipeError("Bad chooseOptions step");
      for (const g of groups as PlanGroup[]) {
        for (const option of g.options) out.push(...planSteps(g.select ?? s.steps, { ...vars, option }, forbidden));
        out.push(...planSteps(g.after ?? [], vars, forbidden));
      }
      continue;
    }
    if (s.op === "forEach") {
      const list = s.over ? vars[s.over] : undefined;
      // A list of labels; the groups of chooseOptions are not something to loop over.
      if (!Array.isArray(list) || list.some((v) => typeof v !== "string") || !s.as || !s.steps) throw new RecipeError("Bad forEach step");
      for (const v of list as string[]) out.push(...planSteps(s.steps, { ...vars, [s.as]: v }, forbidden));
      continue;
    }
    if (s.op === "repeat") {
      if (!s.steps) throw new RecipeError("Bad repeat step");
      const n = count(s.times, vars);
      for (let i = 0; i < n; i++) out.push(...planSteps(s.steps, vars, forbidden));
      continue;
    }
    const step: PlainStep = { op: s.op };
    if (s.label !== undefined) step.label = fill(s.label, vars);
    if (s.role !== undefined) step.role = fill(s.role, vars);
    if (s.name !== undefined) step.name = fill(s.name, vars);
    if (s.text !== undefined) step.text = fill(s.text, vars);
    if (s.exact !== undefined) step.exact = s.exact;
    if (s.within !== undefined) step.within = fill(s.within, vars);
    if (s.op === "clickNth") step.index = count(s.index, vars);
    if (!step.label && !(step.role && step.name) && !step.text) throw new RecipeError("Step has no target");
    for (const t of [step.label, step.name, step.text]) {
      if (t !== undefined && isForbiddenLabel(t, forbidden)) throw new RecipeError("Refused a payment control");
    }
    out.push(step);
  }
  return out;
}

export interface Target {
  el: HTMLElement;
  label: string;
  /** Everything the element shows, so a harmless label on a payment button is still caught. */
  text: string;
}

/** The last guard before a click: the target's label or text holds a forbidden word. */
export function isForbiddenTarget(t: Pick<Target, "label" | "text">, forbidden: string[]): boolean {
  return isForbiddenLabel(t.label, forbidden) || isForbiddenLabel(t.text, forbidden);
}

function textOf(el: HTMLElement): string {
  return (el.innerText || el.textContent || "").trim();
}

function matches(have: string, want: string, exact: boolean | undefined): boolean {
  return exact ? have.trim() === want : have.includes(want);
}

/**
 * The targets whose closest ancestor (or the element itself) holding `within` is nearest: the + in the shot's own
 * row, not the syrup's. None when no ancestor holds it. Same rule as the learner's driver (spikes/kibo-learn).
 */
export function nearestWithin(found: Target[], within: string): Target[] {
  const distance = (el: HTMLElement) => {
    let d = 0;
    for (let a: HTMLElement | null = el; a; a = a.parentElement, d++) if ((a.innerText ?? "").includes(within)) return d;
    return Infinity;
  };
  const ds = found.map((t) => distance(t.el));
  const min = Math.min(...ds);
  return min === Infinity ? [] : found.filter((_, i) => ds[i] === min);
}

/** Every element the step could mean, in page order. */
function candidates(doc: Document, step: PlainStep): Target[] {
  const all = allCandidates(doc, step);
  return step.within === undefined ? all : nearestWithin(all, step.within);
}

function allCandidates(doc: Document, step: PlainStep): Target[] {
  if (step.label !== undefined) {
    return findByLabel(doc, step.label).map((el) => ({ el: el as HTMLElement, label: step.label!, text: textOf(el as HTMLElement) }));
  }
  if (step.role && step.name) {
    // Radios and checkboxes are named by their <label> text ("라지 (+4,000원)" contains "라지").
    const selector = step.role === "radio" || step.role === "checkbox" ? `input[type=${step.role}]` : `[role="${step.role}"]`;
    const out: Target[] = [];
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const box = (el.closest("label") as HTMLElement | null) ?? el;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = box === el ? el.getAttribute("aria-label") || textOf(el) : textOf(box);
      if (matches(name, step.name, step.exact)) out.push({ el, label: name, text: name });
    }
    return out;
  }
  return clickables(doc)
    .filter((c) => matches(textOf(c.el), step.text ?? "", step.exact))
    .map((c) => ({ el: c.el, label: c.label, text: textOf(c.el) }));
}

function pick(found: Target[], step: PlainStep): Target | null {
  if (step.op === "clickNth") return found[step.index ?? 0] ?? null;
  return found.length === 1 ? found[0] : null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Waits for the step's one target; clickIfVisible looks once and skips when it is absent. */
async function locate(doc: Document, step: PlainStep): Promise<Target | null> {
  if (step.op === "clickIfVisible") {
    const found = candidates(doc, step);
    if (found.length > 1) throw new RecipeError("More than one match");
    return found[0] ?? null;
  }
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    const t = pick(candidates(doc, step), step);
    if (t) return t;
    if (Date.now() >= deadline) throw new RecipeError("Target not found or not unique");
    await sleep(POLL_MS);
  }
}

/** A frame, or a short timeout when the page is in a background tab (no animation frames there). */
function frame(win: Window): Promise<void> {
  return new Promise((resolve) => {
    win.requestAnimationFrame(() => resolve());
    setTimeout(resolve, 100);
  });
}

/** Two animation frames, then until the page has been quiet for a moment (at most SETTLE_MAX_MS). */
async function settle(doc: Document): Promise<void> {
  const win = doc.defaultView;
  if (!win) return;
  await frame(win);
  await frame(win);
  await new Promise<void>((resolve) => {
    let quiet: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
    const observer = new win.MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, QUIET_MS);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    quiet = setTimeout(done, QUIET_MS);
    const cap = setTimeout(done, SETTLE_MAX_MS);
  });
}

/** Clicks each step's target in order. Throws RecipeError on the first step that cannot be done; never retries. */
export async function runPlan(doc: Document, plan: PlainStep[], opts: { forbiddenLabels: string[] }): Promise<void> {
  for (const step of plan) {
    const target = await locate(doc, step);
    if (!target) continue;
    if (isForbiddenTarget(target, opts.forbiddenLabels)) throw new RecipeError("Refused a payment control");
    if (step.op === "check" && (target.el as HTMLInputElement).checked) continue;
    target.el.click();
    await settle(doc);
  }
}
