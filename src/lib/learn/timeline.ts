// A recorded KIBO Learn run (public/learn/<runId>/run.json, written by `npm run learn:runs` from the learner's
// trace) turned into the /learn viewer's timeline. Nothing is added: one step per recorded turn, its own words come
// from the turn's one-line result, and the counters are the trace's own discovery counts.

export interface Known {
  items: number;
  optionGroups: number;
  categories: number;
}

export interface LearnCall {
  tool: string;
  args: { steps?: { op?: string; label?: string; name?: string; text?: string; within?: string }[]; kind?: string; names?: string[] };
  result: string;
}

export interface LearnTurn {
  n: number;
  at: string;
  calls: LearnCall[];
  discoveries: Known;
  image: string;
  width: number;
  height: number;
}

export interface LearnRunData {
  runId: string;
  kioskId: string;
  brand: string;
  provider: string;
  model: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  turnCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  grade: {
    itemsFound: number;
    itemsOf: number;
    pricesCorrect: number;
    orders: { total: number; correct: number; safeRefusal: number; unsafe: number; ruleViolationDetected: number; linesChecked: number | null };
    itemsSource: string;
    ordersSource: string;
  };
  skill: {
    categories: string[];
    catalog: { name: string; category: string; price: number; soldOut: boolean; groups: { name: string; required: boolean; options: string[] }[] }[];
  };
  sources: { trace: string; stats: string; skill: string; notes: string | null };
  turns: LearnTurn[];
}

export type Outcome = "ok" | "refused" | "failed";

export interface TimelineStep {
  index: number;
  n: number;
  /** Real time since the run started. */
  elapsedMs: number;
  text: string;
  outcome: Outcome;
  known: Known;
  /** The last names the learner wrote down, up to this turn. */
  latest: { n: number; names: string[] } | null;
  image: string;
  width: number;
  height: number;
}

export type MilestoneKind = "first-item" | "all-categories" | "audit" | "self-test" | "finish";

export interface Milestone {
  kind: MilestoneKind;
  label: string;
  /** Step index and turn number where it happened. */
  index: number;
  n: number;
}

/** One tool call in plain words. The learner's own result line is kept when it is not a known shape. */
export function describeCall(call: LearnCall): { text: string; outcome: Outcome } {
  const r = call.result;
  if (call.tool === "act") {
    if (r.startsWith("tapped ")) return { text: `Tapped ${r.slice("tapped ".length)}`, outcome: "ok" };
    const refused = r.match(/Refused: "([^"]+)" is a payment or checkout control/);
    if (refused) return { text: `Refused to tap ${refused[1]}: it is a payment or checkout button`, outcome: "refused" };
    const many = r.match(/"(?:label|name|text)":"([^"]+)".*matches (\d+) elements/);
    if (many) return { text: `Did not tap: “${many[1]}” matches ${many[2]} buttons on this screen`, outcome: "failed" };
    return { text: "A tap failed", outcome: "failed" };
  }
  if (call.tool === "reload") return { text: "Reloaded the kiosk to start over", outcome: "ok" };
  if (call.tool === "snapshot") return { text: "Read the screen", outcome: "ok" };
  if (call.tool === "record") {
    const names = call.args.names ?? [];
    if (call.args.kind === "item" && names.length) {
      return { text: `Wrote down ${names.length} ${names.length === 1 ? "item" : "items"}: ${names.join(", ")}`, outcome: "ok" };
    }
    if (call.args.kind === "flow") return { text: "Wrote down a note about the order flow", outcome: "ok" };
  }
  if (call.tool === "records") {
    const m = r.match(/listed (\d+) items/);
    if (m) return { text: `Read back its notes: ${m[1]} items`, outcome: "ok" };
  }
  if (call.tool === "audit") {
    return r === "audit ok"
      ? { text: "Coverage audit without AI: passed", outcome: "ok" }
      : { text: "Coverage audit without AI: not passed", outcome: "failed" };
  }
  if (call.tool === "testSkill") {
    const m = r.match(/(\d+)\/(\d+) passed/);
    if (m) return { text: `Self-test without AI: ${m[1]} of ${m[2]} orders passed`, outcome: m[1] === m[2] ? "ok" : "failed" };
  }
  if (call.tool === "finish") {
    if (r === "finish accepted") return { text: "Asked to finish: accepted", outcome: "ok" };
    if (r === "finish rejected") return { text: "Asked to finish: refused by the finish gate", outcome: "failed" };
  }
  return { text: `${call.tool}: ${r}`, outcome: r.includes("failed") ? "failed" : "ok" };
}

const RANK: Record<Outcome, number> = { ok: 0, failed: 1, refused: 2 };

export function buildTimeline(run: Pick<LearnRunData, "startedAt" | "turns">): { steps: TimelineStep[]; milestones: Milestone[] } {
  const start = Date.parse(run.startedAt);
  let latest: TimelineStep["latest"] = null;
  const steps = run.turns.map((t, index): TimelineStep => {
    const parts = t.calls.map(describeCall);
    for (const c of t.calls) if (c.tool === "record" && c.args.names?.length) latest = { n: t.n, names: c.args.names };
    return {
      index,
      n: t.n,
      elapsedMs: Math.max(0, Date.parse(t.at) - start),
      text: parts.map((p) => p.text).join("; "),
      outcome: parts.reduce<Outcome>((worst, p) => (RANK[p.outcome] > RANK[worst] ? p.outcome : worst), "ok"),
      known: t.discoveries,
      latest,
      image: t.image,
      width: t.width,
      height: t.height,
    };
  });

  const milestones: Milestone[] = [];
  const add = (kind: MilestoneKind, label: string, index: number) => {
    if (index >= 0) milestones.push({ kind, label, index, n: steps[index].n });
  };
  add("first-item", "First items written down", steps.findIndex((s) => s.known.items > 0));
  const categories = Math.max(0, ...steps.map((s) => s.known.categories));
  if (categories > 0) {
    add("all-categories", `All ${categories} categories written down`, steps.findIndex((s) => s.known.categories === categories));
  }
  const callAt = (test: (c: LearnCall) => boolean) => run.turns.findIndex((t) => t.calls.some(test));
  add("audit", "Coverage audit passed", callAt((c) => c.tool === "audit" && c.result === "audit ok"));
  const selfTest = callAt((c) => {
    const m = c.tool === "testSkill" ? c.result.match(/(\d+)\/(\d+) passed/) : null;
    return m !== null && m[1] === m[2];
  });
  if (selfTest >= 0) add("self-test", `Self-test ${run.turns[selfTest].calls.find((c) => c.tool === "testSkill")!.result.match(/\d+\/\d+/)![0]} passed`, selfTest);
  add("finish", "Finished", callAt((c) => c.tool === "finish" && c.result === "finish accepted"));
  milestones.sort((a, b) => a.index - b.index);
  return { steps, milestones };
}

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
