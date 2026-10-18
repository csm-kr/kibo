import { isForbiddenLabel, isPaymentText } from "@/lib/adapters/learned";
import type { GroupCondition, RecipeStep } from "@/types/menu";
import { clickables, findByLabel } from "./labels";

// Replays a skill recipe on the kiosk page without AI (ADR-007). planSteps is pure: placeholders, loops and the
// forbidden-label check all happen before the first click. runPlan clicks one located target per step.

/** One option group of the line's item for chooseOptions: the chosen kiosk labels and ids, and the group's own steps. */
export interface PlanGroup {
  groupId?: string;
  options: string[];
  optionIds?: string[];
  select?: RecipeStep[];
  after?: RecipeStep[];
  appliesWhen?: GroupCondition;
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

/** The group ids the recipe's chooseOptions steps name in "groups": the others run at a chooseOptions without them. */
function claimedGroups(steps: RecipeStep[], out = new Set<string>()): Set<string> {
  for (const s of steps) {
    if (s.op === "chooseOptions") for (const g of s.groups ?? []) out.add(g);
    claimedGroups(s.steps ?? [], out);
  }
  return out;
}

/** A group shown only after another choice applies when that group is not on the item or the line chose it. */
function applies(group: PlanGroup, groups: PlanGroup[]): boolean {
  const when = group.appliesWhen;
  if (!when) return true;
  const other = groups.find((g) => g.groupId === when.groupId);
  return !other || (other.optionIds ?? []).includes(when.optionId);
}

/**
 * Expands forEach, repeat, chooseOptions and {placeholders}; refuses any step aimed at a forbidden (payment) label.
 * chooseOptions runs, per group of the line's item, its select steps (or the op's steps) for each chosen option, then
 * its after steps. Since round 4 a chooseOptions may name "groups" and runs only those, where it stands; one without
 * runs the groups no other chooseOptions names; a conditional group the line made no pick in is skipped, with its
 * after steps, when its condition was not chosen. The learner's rules (spikes/kibo-learn/plan.mjs), ported.
 */
export function planSteps(steps: RecipeStep[], vars: Vars, forbidden: string[]): PlainStep[] {
  return expand(steps, vars, forbidden, claimedGroups(steps));
}

function expand(steps: RecipeStep[], vars: Vars, forbidden: string[], claimed: Set<string>): PlainStep[] {
  const out: PlainStep[] = [];
  for (const s of steps) {
    if (s.op === "chooseOptions") {
      const groups = vars.groups;
      if (!Array.isArray(groups) || !s.steps) throw new RecipeError("Bad chooseOptions step");
      for (const g of groups as PlanGroup[]) {
        const id = g.groupId;
        const mine = s.groups ? id !== undefined && s.groups.includes(id) : id === undefined || !claimed.has(id);
        if (!mine || (!g.options.length && !applies(g, groups as PlanGroup[]))) continue;
        for (const option of g.options) out.push(...expand(g.select ?? s.steps, { ...vars, option }, forbidden, claimed));
        out.push(...expand(g.after ?? [], vars, forbidden, claimed));
      }
      continue;
    }
    if (s.op === "forEach") {
      const list = s.over ? vars[s.over] : undefined;
      // A list of labels; the groups of chooseOptions are not something to loop over.
      if (!Array.isArray(list) || list.some((v) => typeof v !== "string") || !s.as || !s.steps) throw new RecipeError("Bad forEach step");
      for (const v of list as string[]) out.push(...expand(s.steps, { ...vars, [s.as]: v }, forbidden, claimed));
      continue;
    }
    if (s.op === "repeat") {
      if (!s.steps) throw new RecipeError("Bad repeat step");
      const n = count(s.times, vars);
      for (let i = 0; i < n; i++) out.push(...expand(s.steps, vars, forbidden, claimed));
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

/**
 * The last guard before a click: the target's label holds a forbidden word, or its text holds a payment or order
 * control (read in whole lines, as the learner does, so a notice that mentions paying does not refuse it; I-405).
 */
export function isForbiddenTarget(t: Pick<Target, "label" | "text">, forbidden: string[]): boolean {
  return isForbiddenLabel(t.label, forbidden) || isPaymentText(t.text, forbidden);
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

/** Native elements that carry a role without the attribute (HTML-AAM), for the roles kiosk skills use. */
const IMPLICIT_ROLE: Record<string, string[]> = { button: ["button"] };

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
    // Radios and checkboxes are named by their <label> text ("라지 (+4,000원)" contains "라지"). Other roles also match
    // the native elements that have them, as the learner's getByRole does: a <button> is a button (bk9's 담기, I-405).
    const selector =
      step.role === "radio" || step.role === "checkbox"
        ? `input[type=${step.role}]`
        : [`[role="${step.role}"]`, ...(IMPLICIT_ROLE[step.role] ?? [])].join(", ");
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

/** A click about to happen: the target's label and its box in the page's own pixels. */
export interface TapEvent {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A popup the skill answers whenever it shows (a timeout modal): its text and the step that dismisses it. */
export interface Interrupt {
  text: string;
  dismiss: RecipeStep;
}

interface RunOpts {
  forbiddenLabels: string[];
  onTap?: (tap: TapEvent) => void | Promise<void>;
  interrupts?: Interrupt[];
}

/** Clicks one located target, unless it is a payment control or an already checked box; the host hears it first. */
async function clickTarget(doc: Document, step: PlainStep, target: Target, opts: RunOpts): Promise<void> {
  if (isForbiddenTarget(target, opts.forbiddenLabels)) throw new RecipeError("Refused a payment control");
  if (step.op === "check" && (target.el as HTMLInputElement).checked) return;
  if (opts.onTap) {
    const r = target.el.getBoundingClientRect();
    await opts.onTap({ label: target.label, x: r.x, y: r.y, w: r.width, h: r.height });
  }
  target.el.click();
  await settle(doc);
}

/** Answers each interrupt whose text the page shows now; returns how many it answered. */
async function answerInterrupts(doc: Document, opts: RunOpts): Promise<number> {
  let answered = 0;
  for (const it of opts.interrupts ?? []) {
    if (!(doc.body?.innerText ?? "").includes(it.text)) continue;
    // Checked at load (skillSchema) and planned again here like any step, so a payment control is still refused.
    for (const step of planSteps([it.dismiss], {}, opts.forbiddenLabels)) {
      const target = await locate(doc, step);
      if (target) await clickTarget(doc, step, target, opts);
    }
    answered++;
  }
  return answered;
}

/**
 * Clicks each step's target in order. Throws RecipeError on the first step that cannot be done.
 * `onTap` hears each click right before it happens (only clicks that happen) and is awaited, so a host can show it.
 * With interrupts (round 3, I-194): they are answered before each step and once at the end, and a step whose target
 * was not found is retried once after answering one that came up meanwhile. Nothing was clicked for that step yet,
 * so the retry cannot add twice; a refused step is never retried.
 */
export async function runPlan(doc: Document, plan: PlainStep[], opts: RunOpts): Promise<void> {
  const answering = !!opts.interrupts?.length;
  for (const step of plan) {
    if (answering) await answerInterrupts(doc, opts);
    let target: Target | null;
    try {
      target = await locate(doc, step);
    } catch (e) {
      if (!answering || !(e instanceof RecipeError) || !(await answerInterrupts(doc, opts))) throw e;
      target = await locate(doc, step);
    }
    if (target) await clickTarget(doc, step, target, opts);
  }
  if (answering) await answerInterrupts(doc, opts);
}
