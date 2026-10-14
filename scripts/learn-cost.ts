import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// USD cost of each recorded KIBO Learn run (`npm run learn:cost`): the token counts in every learn-stats.json of the
// blind-kiosk runs and the Doughhouse run 3, priced with the Gemini API list prices stored in
// evidence/cost-per-order.json. Writes evidence/learn-cost.json only; reads local files, no network.

/** USD per 1M tokens (gemini-3.8-flash). */
export interface FlashPrices {
  flashInput: number;
  flashCachedInput: number;
  flashOutput: number;
}

interface Tokens {
  inputTokens: number;
  /** Part of inputTokens served from a cache. Missing or 0: not recorded. */
  cachedInputTokens?: number;
  outputTokens: number;
}

const M = 1_000_000;

export const round4 = (x: number) => Math.round((x + Number.EPSILON) * 1e4) / 1e4;

const usdOf = (uncached: number, cached: number, output: number, p: FlashPrices) =>
  (uncached * p.flashInput + cached * p.flashCachedInput + output * p.flashOutput) / M;

/**
 * Cost of one run. The learner before 13-blind-kiosks:4 did not read cachedContentTokenCount on the Gemini path and
 * wrote 0 (spikes/kibo-learn/CHANGES.md); every run that recorded it has a positive count. So a missing or 0 count
 * is "not recorded", and all input is billed as uncached (an upper bound).
 */
export function runCost(t: Tokens, p: FlashPrices) {
  const cachedRecorded = typeof t.cachedInputTokens === "number" && t.cachedInputTokens > 0;
  const cached = cachedRecorded ? t.cachedInputTokens! : 0;
  const uncached = t.inputTokens - cached;
  return {
    cachedRecorded,
    inputTokens: t.inputTokens,
    cachedInputTokens: cached,
    uncachedInputTokens: uncached,
    outputTokens: t.outputTokens,
    usd: round4(usdOf(uncached, cached, t.outputTokens, p)),
  };
}

type RunCost = ReturnType<typeof runCost>;

/** Sums of a group's runs; USD is the price of the summed tokens, not the sum of the rounded run costs. */
export function groupTotals(runs: (RunCost & { minutes: number; turns: number; finished: boolean })[], p: FlashPrices) {
  const sum = (f: (r: (typeof runs)[number]) => number) => runs.reduce((s, r) => s + f(r), 0);
  const uncached = sum((r) => r.uncachedInputTokens);
  const cached = sum((r) => r.cachedInputTokens);
  const output = sum((r) => r.outputTokens);
  return {
    runs: runs.length,
    finished: runs.filter((r) => r.finished).length,
    minutes: Math.round(sum((r) => r.minutes) * 10) / 10,
    turns: sum((r) => r.turns),
    inputTokens: sum((r) => r.inputTokens),
    cachedInputTokens: cached,
    uncachedInputTokens: uncached,
    outputTokens: output,
    cachedRecordedInAll: runs.every((r) => r.cachedRecorded),
    usd: round4(usdOf(uncached, cached, output, p)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The script: find the runs, label them, write evidence/learn-cost.json.

const RESULTS = "spikes/blind-kiosks/results";
const RUN_FOLDERS = ["baseline", "final", "final-after-fix", "final-attempt2", "round3-informed", "round4-informed"];
const DOUGHHOUSE_RUN3 = "spikes/kibo-learn/results/run3";
const OUT = "evidence/learn-cost.json";

const GROUPS = {
  baseline: {
    name: "four test kiosks, baseline",
    note: "bk1-bk4 with the phase 13 learner before its improvements. Cached tokens were not recorded, so all input is billed as uncached (upper bound).",
  },
  final: {
    name: "four test kiosks, final (learner tuned on them)",
    note: "bk1-bk4 after the learner was improved from their baseline failures (on the dev set only): not a blind result.",
  },
  round2: {
    name: "round 2 fresh hold-out",
    note: "bk5 and bk6, added after the phase 13 improvements and learned once; unseen by the learner's developers.",
  },
  informed: {
    name: "informed rerun",
    note: "Reruns on test kiosks after their results were read; never unseen-kiosk results. Each run carries its own label.",
  },
  round3: {
    name: "round 3 fresh",
    note: "bk7 and bk8, learned once with the frozen round 3 learning logic (ea28477). bk8 attempt 1 was killed at the 30 min cap and wrote no learn-stats.json (see notIncluded).",
  },
  round4: {
    name: "round 4 fresh",
    note: "bk9 and bk10, learned once with the frozen round 4 learner (a9522a4).",
  },
  dev: {
    name: "development kiosk",
    note: "Doughhouse (dev set), the learner's own development kiosk: run 3 of phase 6 (cached tokens not recorded, so all its input is billed as uncached, an upper bound), the traced run /learn replays, and the round 3 run (newest). Not a blind result.",
  },
} as const;

type GroupKey = keyof typeof GROUPS;

interface Found {
  kiosk: string;
  runFolder: string;
  group: GroupKey;
  label: string;
  /** False for an attempt the docs do not report as the run's result (a crash before the one allowed rerun). */
  reported: boolean;
}

const kioskNumber = (kiosk: string) => Number(/^bk(\d+)-/.exec(kiosk)?.[1] ?? NaN);

function classify(kiosk: string, run: string, sub: string): Omit<Found, "kiosk" | "runFolder"> {
  const n = kioskNumber(kiosk);
  if (sub) {
    if (run === "baseline" && sub === "crash1") {
      return { group: "baseline", label: "first try, stopped on an expired Vertex token (I-188); not the reported baseline", reported: false };
    }
    throw new Error(`${kiosk}/${run}/${sub}: unexpected nested run`);
  }
  if (run === "baseline" && n >= 1 && n <= 4) return { group: "baseline", label: "phase 13 baseline", reported: true };
  if (run === "final" && n >= 1 && n <= 4) return { group: "final", label: "phase 13 final", reported: true };
  if (run === "final" && (n === 5 || n === 6)) return { group: "round2", label: "fresh hold-out, learned once", reported: true };
  if (run === "final" && (n === 7 || n === 8)) return { group: "round3", label: "fresh, learned once", reported: true };
  if (run === "final-attempt2" && n === 8) {
    return { group: "round3", label: "attempt 2, the one rerun after attempt 1 was killed at the 30 min cap", reported: true };
  }
  if (run === "final" && (n === 9 || n === 10)) return { group: "round4", label: "fresh, learned once", reported: true };
  if (run === "final-after-fix" && n === 2) {
    return { group: "informed", label: "informed by bk2 (ran after the I-193 fix that bk2 exposed; I-202)", reported: true };
  }
  if (run === "round3-informed") return { group: "informed", label: "round 3 informed rerun (learner ea28477), never unseen", reported: true };
  if (run === "round4-informed") return { group: "informed", label: "round 4 informed rerun (learner a9522a4), never unseen", reported: true };
  throw new Error(`${kiosk}/${run}: no group`);
}

/** learn-stats.json files in a run folder and its sub-folders (a crashed first try), never in trace/. */
function statsFiles(dir: string, sub = ""): { sub: string; dir: string }[] {
  const here = existsSync(join(dir, "learn-stats.json")) ? [{ sub, dir }] : [];
  const children = readdirSync(dir)
    .filter((f) => f !== "trace" && statSync(join(dir, f)).isDirectory())
    .flatMap((f) => statsFiles(join(dir, f), sub ? `${sub}/${f}` : f));
  return [...here, ...children];
}

function findRuns(): (Found & { dir: string })[] {
  const kiosks = readdirSync(RESULTS)
    .filter((k) => /^bk\d+-/.test(k))
    .sort((a, b) => kioskNumber(a) - kioskNumber(b));
  const found: (Found & { dir: string })[] = [];
  for (const kiosk of kiosks) {
    for (const run of RUN_FOLDERS) {
      const runDir = join(RESULTS, kiosk, run);
      if (!existsSync(runDir)) continue;
      for (const { sub, dir } of statsFiles(runDir)) {
        found.push({ kiosk, runFolder: dir, dir, ...classify(kiosk, run, sub) });
      }
    }
  }
  found.push({ kiosk: "doughhouse", runFolder: DOUGHHOUSE_RUN3, dir: DOUGHHOUSE_RUN3, group: "dev", label: "run 3 (phase 6)", reported: true });
  // The traced run /learn replays, and the newest Doughhouse run (round 3 learner).
  for (const [folder, label] of [
    ["gemini-doughhouse-after", "13-blind-kiosks:4 learner, traced (the /learn card)"],
    ["gemini-doughhouse-round3", "round 3 learner (newest Doughhouse run)"],
  ] as const) {
    const dir = `${RESULTS}/dev/${folder}`;
    found.push({ kiosk: "doughhouse", runFolder: dir, dir, group: "dev", label, reported: true });
  }
  return found;
}

interface LearnStats {
  provider: string;
  model: string;
  learner?: { commit: string; dirty: boolean };
  cachedInputTokens?: number;
  finished: boolean;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  minutes: string | number;
  error?: string;
}

function main() {
  const evidence = JSON.parse(readFileSync("evidence/cost-per-order.json", "utf8")) as {
    prices: FlashPrices & { source: string; readOn: string; tier: string; validThrough: string };
  };
  const { source, readOn, tier, validThrough, flashInput, flashCachedInput, flashOutput } = evidence.prices;
  const prices: FlashPrices = { flashInput, flashCachedInput, flashOutput };

  const runs = findRuns().map((f) => {
    const s = JSON.parse(readFileSync(join(f.dir, "learn-stats.json"), "utf8")) as LearnStats;
    const skillWritten = existsSync(join(f.dir, "skill.json"));
    if (skillWritten !== s.finished) console.warn(`${f.runFolder}: finished=${s.finished} but skill.json ${skillWritten ? "exists" : "is missing"}`);
    return {
      kiosk: f.kiosk,
      runFolder: f.runFolder,
      group: GROUPS[f.group].name,
      label: f.label,
      reported: f.reported,
      model: s.model,
      learner: s.learner ?? null,
      ...(s.error ? { error: s.error } : {}),
      minutes: Number(s.minutes),
      turns: s.turns,
      finished: s.finished,
      skillWritten,
      ...runCost(s, prices),
    };
  });

  const groups = (Object.keys(GROUPS) as GroupKey[]).map((key) => {
    const members = runs.filter((r) => r.group === GROUPS[key].name);
    const reportedOnly = members.filter((r) => r.reported);
    return {
      name: GROUPS[key].name,
      note: GROUPS[key].note,
      totals: groupTotals(members, prices),
      ...(reportedOnly.length < members.length ? { totalsReportedRunsOnly: groupTotals(reportedOnly, prices) } : {}),
      runs: members,
    };
  });

  const out = {
    about:
      "Cost of every recorded KIBO Learn run (scripts/learn-cost.ts, `npm run learn:cost`, checked by scripts/learn-cost.test.ts): tokens from each run's learn-stats.json x the gemini-3.8-flash prices below, USD rounded to 4 decimals. Uncached input at flashInput, cached input at flashCachedInput, output at flashOutput. The learner called gemini-3.8-flash on Vertex AI, while these are the Gemini API's paid-tier list prices; the Vertex AI price for this model was not read (unverified). Thinking tokens are not recorded: the learner sums usageMetadata promptTokenCount, cachedContentTokenCount and candidatesTokenCount only (spikes/kibo-learn/learner.mjs) and sets no thinking config, so outputTokens does not include thoughtsTokenCount and these costs leave thinking out (output is a lower bound). `cachedRecorded: false` (a learner before 13-blind-kiosks:4, which wrote 0 for cached tokens) bills all input as uncached (input is an upper bound). `finished` is the learner's own flag (the finish gate passed and a skill was written); `skillWritten` is whether skill.json is in the run folder. Groups are kept apart on purpose: they used different learners on kiosks with different histories, so there is no combined total. `totals` sum every run in a group, including attempts the docs do not report as the result (`reported: false`); `totalsReportedRunsOnly` leaves those out. Read each group's note and each run's label before quoting a number.",
    prices: { source, readOn, tier, validThrough, flashInput, flashCachedInput, flashOutput },
    groups,
    notIncluded: [
      {
        runFolder: `${RESULTS}/bk8-tableorder/final`,
        reason: "round 3 fresh, attempt 1: killed at the 30 min cap (wrapper.json); no learn-stats.json, so its tokens are not recorded.",
      },
      {
        runFolder: `${RESULTS}/bk7-bubbletea/round4-informed`,
        reason: "round 4 informed, attempt 1: stopped by hand after 6.9 min (wrapper.json); no learn-stats.json. ROUND4.md quotes 895,649 input and 6,855 output tokens from its trace, at most $0.70 with input billed as uncached.",
      },
      {
        runFolder: `${RESULTS}/bk1-cinema/baseline-crashed, ${RESULTS}/bk2-bakery/baseline-crashed`,
        reason: "earlier baseline attempts that stopped on a Vertex HTTP 400 at turn 81 (I-185), before the baseline/ runs; not a requested run folder.",
      },
      { runFolder: `${RESULTS}/dev`, reason: "dev-set runs (Doughhouse and Gureum, Gemini and OpenAI); not requested here." },
    ],
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  for (const g of groups) {
    console.log(`${g.name}: $${g.totals.usd}, ${g.totals.minutes} min, ${g.totals.finished}/${g.totals.runs} finished${g.totalsReportedRunsOnly ? ` (reported runs only: $${g.totalsReportedRunsOnly.usd}, ${g.totalsReportedRunsOnly.minutes} min, ${g.totalsReportedRunsOnly.finished}/${g.totalsReportedRunsOnly.runs})` : ""}`);
    for (const r of g.runs) console.log(`  ${r.kiosk} ${r.runFolder.split("/").slice(-2).join("/")}: $${r.usd}${r.cachedRecorded ? "" : " (cache not recorded)"}`);
  }
}

if (process.argv[1]?.endsWith("learn-cost.ts")) main();
