import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// Copies recorded KIBO Learn runs into public/learn/<runId>/ for the /learn viewer (`npm run learn:runs`).
// The trace is copied, never edited: every turn in order, its tools with labels only (no prompts, no model text),
// its one-line result and its discovery counts. Screenshots are re-encoded to WebP <= 60 KB each.

const OUT = "public/learn";
const MAX_IMAGE_BYTES = 60 * 1024;
const MAX_RUN_BYTES = 5 * 1024 * 1024;

interface RunSource {
  runId: string;
  kioskId: string;
  dir: string;
  /** grade.json from the blind-kiosk grader, or a holdout.log with a reviewed skill to compare with. */
  grade?: string;
  holdout?: string;
  reviewedSkill?: string;
  notes?: string;
}

const RUNS: RunSource[] = [
  {
    // Round 4 fresh kiosk (spikes/blind-kiosks/ROUND4.md): never seen before this run, learner frozen at its commit;
    // 10 correct of 10 under grader v2.
    runId: "bunsik",
    kioskId: "bk9-bunsik",
    dir: "spikes/blind-kiosks/results/bk9-bunsik/final",
    grade: "spikes/blind-kiosks/results/bk9-bunsik/final/grade-v2.json",
    notes: "spikes/blind-kiosks/ROUND4.md",
  },
  {
    // Fresh hold-out (never seen before its run, added after the learner fixes) with unsafe = 0 and 10 correct of 10
    // under grader v2, which opens the closed cart drawer (13-blind-kiosks:10, I-183).
    runId: "themepark",
    kioskId: "bk6-themepark",
    dir: "spikes/blind-kiosks/results/bk6-themepark/final",
    grade: "spikes/blind-kiosks/results/bk6-themepark/final/grade-v2.json",
    notes: "spikes/blind-kiosks/results/bk6-themepark/final/notes.md",
  },
  {
    // Best blind final with unsafe = 0: 10 correct of 10 (bk3-ramen ties; this one has more options the total can confirm).
    runId: "airport-shop",
    kioskId: "bk4-airport-shop",
    dir: "spikes/blind-kiosks/results/bk4-airport-shop/final",
    grade: "spikes/blind-kiosks/results/bk4-airport-shop/final/grade-v2.json",
    notes: "spikes/blind-kiosks/results/bk4-airport-shop/final/notes.md",
  },
  {
    // The traced Doughhouse run of the improved learner (13-blind-kiosks:4).
    runId: "doughhouse",
    kioskId: "doughhouse",
    dir: "spikes/blind-kiosks/results/dev/gemini-doughhouse-after",
    holdout: "spikes/blind-kiosks/results/dev/gemini-doughhouse-after/holdout.log",
    reviewedSkill: "skills/doughhouse.json",
    notes: "spikes/blind-kiosks/results/dev/README.md",
  },
];

type Json = Record<string, unknown>;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Json;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Only the fields a viewer may show: the labels the learner tapped and the names it wrote down. */
function cleanArgs(tool: string, args: Json): Json {
  if (tool === "act") {
    const steps = Array.isArray(args.steps) ? (args.steps as Json[]) : [];
    return {
      steps: steps.map((s) => ({ op: str(s.op), label: str(s.label), name: str(s.name), text: str(s.text), within: str(s.within) })),
    };
  }
  if (tool === "record") return { kind: str(args.kind), names: Array.isArray(args.names) ? args.names.filter((n) => typeof n === "string") : [] };
  return {};
}

async function webp(src: string, dest: string) {
  for (const quality of [70, 60, 50, 40, 30]) {
    const buf = await sharp(src).webp({ quality }).toBuffer();
    if (buf.length <= MAX_IMAGE_BYTES) {
      writeFileSync(dest, buf);
      const meta = await sharp(buf).metadata();
      return { width: meta.width ?? 0, height: meta.height ?? 0 };
    }
  }
  throw new Error(`${src}: cannot fit ${MAX_IMAGE_BYTES} bytes`);
}

function gradeSummary(r: RunSource, skill: Json) {
  if (r.grade) {
    const g = read(r.grade) as {
      catalog: { items: { matched: number; key: number }; price: { correct: number; of: number } };
      orders: {
        total: number; correct: number; safeRefusal: number; unsafe: number; linesChecked: number;
        results: { kioskTotal: number | null; skillPredicts: number | null }[];
      };
    };
    // Orders the kiosk ran where the skill's own total (what a phone would quote) differs from the kiosk's (I-197).
    const skillTotalDiffers = g.orders.results.filter((x) => x.kioskTotal != null && x.skillPredicts != null && x.kioskTotal !== x.skillPredicts).length;
    return {
      itemsFound: g.catalog.items.matched,
      itemsOf: g.catalog.items.key,
      pricesCorrect: g.catalog.price.correct,
      orders: {
        total: g.orders.total,
        correct: g.orders.correct,
        safeRefusal: g.orders.safeRefusal,
        unsafe: g.orders.unsafe,
        ruleViolationDetected: 0,
        linesChecked: g.orders.linesChecked,
        skillTotalDiffers,
      },
      itemsSource: r.grade,
      ordersSource: r.grade,
    };
  }
  // Doughhouse has no answer key: items and prices are compared with the reviewed product skill, orders come from
  // the holdout log (PASS = kiosk total equals the hand-computed total; DETECTED = a planted rule violation caught).
  const reviewed = (read(r.reviewedSkill!).catalog as { label: string; price: number }[]) ?? [];
  const learned = (skill.catalog as { name: string; price: number }[]) ?? [];
  const found = reviewed.filter((x) => learned.some((l) => l.name === x.label));
  const priced = reviewed.filter((x) => learned.some((l) => l.name === x.label && l.price === x.price));
  const lines = readFileSync(r.holdout!, "utf8").split("\n").filter(Boolean);
  const pass = lines.filter((l) => l.startsWith("PASS")).length;
  const detected = lines.filter((l) => l.startsWith("DETECTED")).length;
  const failed = lines.length - pass - detected;
  return {
    itemsFound: found.length,
    itemsOf: reviewed.length,
    pricesCorrect: priced.length,
    orders: { total: pass + failed, correct: pass, safeRefusal: 0, unsafe: failed, ruleViolationDetected: detected, linesChecked: null, skillTotalDiffers: null },
    itemsSource: `${r.dir}/skill.json, ${r.reviewedSkill}`,
    ordersSource: r.holdout,
  };
}

async function build(r: RunSource) {
  const traceDir = join(r.dir, "trace");
  const out = join(OUT, r.runId);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const header = read(join(traceDir, "trace.json"));
  const stats = read(join(r.dir, "learn-stats.json"));
  const skill = read(join(r.dir, "skill.json"));
  const count = readdirSync(traceDir).filter((f) => /^turn-\d+\.json$/.test(f)).length;

  const turns = [];
  for (let n = 1; n <= count; n++) {
    const t = read(join(traceDir, `turn-${n}.json`));
    const image = `turn-${n}.webp`;
    const size = await webp(join(traceDir, `turn-${n}.jpg`), join(out, image));
    const calls = ((t.calls as Json[]) ?? []).map((c) => ({
      tool: String(c.tool),
      args: cleanArgs(String(c.tool), (c.args as Json) ?? {}),
      result: String(c.resultSummary ?? ""),
    }));
    turns.push({ n, at: String(t.at), calls, discoveries: t.discoveries, image, ...size });
  }

  const catalog = (skill.catalog as Json[]).map((c) => ({
    name: String(c.name),
    category: String(c.category),
    price: Number(c.price),
    soldOut: Boolean(c.soldOut),
    groups: ((c.optionGroups as Json[]) ?? []).map((g) => ({
      name: String(g.name),
      required: Boolean(g.required),
      options: ((g.options as Json[]) ?? []).map((o) => String(o.name)),
    })),
  }));

  const run = {
    runId: r.runId,
    kioskId: r.kioskId,
    brand: String(skill.kiosk ?? ""),
    provider: header.provider,
    model: header.model,
    startedAt: header.startedAt,
    endedAt: header.endedAt,
    gate: header.gate,
    minutes: Number(stats.minutes),
    turnCount: Number(stats.turns),
    inputTokens: Number(stats.inputTokens),
    cachedInputTokens: Number(stats.cachedInputTokens),
    grade: gradeSummary(r, skill),
    skill: { categories: skill.categories, catalog },
    sources: {
      trace: traceDir,
      stats: join(r.dir, "learn-stats.json"),
      skill: join(r.dir, "skill.json"),
      notes: r.notes ?? null,
    },
    turns,
  };
  writeFileSync(join(out, "run.json"), `${JSON.stringify(run, null, 1)}\n`);

  const bytes = readdirSync(out).reduce((sum, f) => sum + statSync(join(out, f)).size, 0);
  if (bytes > MAX_RUN_BYTES) throw new Error(`${r.runId}: ${bytes} bytes, over ${MAX_RUN_BYTES}`);
  console.log(`${r.runId}: ${count} turns, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

async function main() {
  // `npm run learn:runs -- bunsik` rebuilds only the named runs; with no names, all of them.
  const only = process.argv.slice(2);
  for (const r of RUNS.filter((x) => only.length === 0 || only.includes(x.runId))) {
    if (!existsSync(join(r.dir, "trace", "trace.json"))) throw new Error(`${r.dir}: no trace`);
    await build(r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
