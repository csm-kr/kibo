// Offline screen of gate variants (kibo-59, 11-27): no API call. Every flow mix (bench/build-flow.ts) and the
// single-sentence alone, quiet-6 and quiet-12 word trials are replayed through gate.ts frame by frame (40 ms, its own
// level test), and scored against the known timelines (refs, which only this judge-side screen reads).
// KIBO is simulated: its greeting ends at 0 s (asked() at 0), and after each customer turn it replies from 1 s after
// the turn's end for 5 s (asked() at the end of that playback). The hold-oracle Live runs had a median reaction of
// about 1.0 s; the 5 s playback is an assumption.
//
//   npx tsx spikes/speaker-gate/candidates/l1-loud/screen.ts      writes work/screen.json, prints the table

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeWav } from "../../bench/audio";
import { frameDb, loudGate, type GateParams } from "./gate";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
const HERE = join(process.cwd(), "spikes/speaker-gate/candidates/l1-loud");
const F = 40;
const N = (16000 * F) / 1000;
const REPLY_AFTER_MS = 1000;
const REPLY_MS = 5000;

type Span = [number, number];
interface Trial {
  id: string;
  set: "flow" | "words";
  lang: string;
  cell: string;
  db: number[];
  enrol: number[];
  customer: Span[];
  /** Customer sentences, for "closes inside a sentence". */
  sentences: Span[];
  bystanders: Span[];
  asks: number[];
}

function levels(file: string): number[] {
  const x = decodeWav(readFileSync(file)).x;
  const out: number[] = [];
  for (let i = 0; i + N <= x.length; i += N) out.push(frameDb(x.subarray(i, i + N)));
  return out;
}

function load(): Trial[] {
  const out: Trial[] = [];
  const flow = JSON.parse(readFileSync(join(BENCH, "refs-flow.json"), "utf8"));
  for (const r of Object.values(flow.trials) as { id: string; lang: string; cell: string; customer: { turns: { startMs: number; endMs: number }[] }; bystanders: { startMs: number; endMs: number }[] }[]) {
    const turns = r.customer.turns.map((u) => [u.startMs, u.endMs] as Span);
    out.push({
      id: r.id,
      set: "flow",
      lang: r.lang,
      cell: r.cell,
      db: levels(join(BENCH, "inputs", r.id, "mix.wav")),
      enrol: levels(join(BENCH, "inputs", r.id, "enrol.wav")),
      customer: turns,
      sentences: turns,
      bystanders: r.bystanders.map((b) => [b.startMs, b.endMs] as Span),
      asks: [0, ...turns.map(([, e]) => e + REPLY_AFTER_MS + REPLY_MS)],
    });
  }
  const words = JSON.parse(readFileSync(join(BENCH, "refs.json"), "utf8"));
  for (const cell of ["alone", "quiet-6", "quiet-12"])
    for (const lang of ["en", "ko"])
      for (const id of words.cells[`words/${lang}/${cell}`] as string[]) {
        const r = words.trials[id];
        out.push({
          id,
          set: "words",
          lang,
          cell,
          db: levels(join(BENCH, "inputs", id, "mix.wav")),
          enrol: levels(join(BENCH, "inputs", id, "enrol.wav")),
          customer: r.customer.speechSpans,
          sentences: [[r.customer.startMs, r.customer.endMs]],
          bystanders: [],
          asks: [0],
        });
      }
  return out;
}

const inside = (spans: Span[], t: number) => spans.some(([s, e]) => t >= s && t < e);

function replay(tr: Trial, p: Partial<GateParams>) {
  const g = loudGate({ frameMs: F, ...p });
  if (p.anchor === "enrol") for (const e of tr.enrol) g.learn(e);
  const asks = [...tr.asks];
  let cust = 0;
  let custOpen = 0;
  let bysOnly = 0;
  let bysOnlyOpen = 0;
  let bysOnlyAsk = 0;
  let bysOnlyAskOpen = 0;
  let lastAsk = -Infinity;
  for (let k = 0; k < tr.db.length; k++) {
    const t = k * F;
    while (asks.length && asks[0] <= t) {
      lastAsk = asks.shift()!;
      g.asked();
    }
    const open = g.push(tr.db[k]);
    const c = inside(tr.customer, t);
    const b = inside(tr.bystanders, t);
    if (c) {
      cust++;
      if (open) custOpen++;
    } else if (b) {
      bysOnly++;
      if (open) bysOnlyOpen++;
      if (t - lastAsk < (p.askMs ?? 4000)) {
        bysOnlyAsk++;
        if (open) bysOnlyAskOpen++;
      }
    }
  }
  const segs = g.segments();
  const closesInside = segs.filter(([, e]) => tr.sentences.some(([s, x]) => e > s && e < x)).length;
  const firstBys = tr.bystanders.length ? Math.min(...tr.bystanders.map(([s]) => s)) : Infinity;
  return {
    ends: segs.length,
    custKept: cust ? custOpen / cust : null,
    bysOnlyOpen: bysOnly ? bysOnlyOpen / bysOnly : null,
    bysOnlyAskOpen: bysOnlyAsk ? bysOnlyAskOpen / bysOnlyAsk : null,
    closesInside,
    bystanderFirst: firstBys < Math.min(...tr.customer.map(([s]) => s)),
  };
}

/** The level under the anchor where a later customer turn stops opening the gate (the fallback starts), from a
 *  synthetic first turn at -20 dBFS for 3 s, 2 s of quiet, then 3 s at -20-x, with and without a question just before. */
function fallbackAt(p: Partial<GateParams>, ask: boolean): number | null {
  for (let x = 0; x <= 20; x++) {
    const g = loudGate({ frameMs: F, ...p });
    const fr = [...Array(25).fill(-70), ...Array(75).fill(-20), ...Array(50).fill(-70)];
    for (const e of fr) g.push(e);
    if (ask) g.asked();
    for (let i = 0; i < 75; i++) g.push(-20 - x);
    for (let i = 0; i < 25; i++) g.push(-70);
    const segs = g.segments();
    const at = 150 * F;
    const opened = segs.some(([s, e]) => s < at + 3000 && e > at + 1500);
    if (!opened) return x;
  }
  return null;
}

function main() {
  const trials = load();
  const variants: { name: string; p: Partial<GateParams> }[] = [
    { name: "ref recent d6 ask cap", p: {} },
    { name: "ref recent d6 ask nocap", p: { maxTurnMs: Infinity } },
  ];
  // The 11-27 pick with the hang-over swept (kibo-59: closes inside an English sentence against bystander time).
  for (const hangMs of [700, 1000, 1300]) variants.push({ name: `pick hang ${hangMs}`, p: { anchor: "first-turn", depthDb: 6, askDb: 0, hangMs } });
  for (const anchor of ["first-turn", "enrol"] as const)
    for (const d of [6, 8, 10, 12])
      for (const ask of [true, false])
        for (const cap of [true, false])
          variants.push({ name: `${anchor} d${d} ${ask ? "ask" : "noask"} ${cap ? "cap" : "nocap"}`, p: { anchor, depthDb: d, askDb: ask ? 6 : 0, maxTurnMs: cap ? 10000 : Infinity } });
  const groups = ["flow/chat@-10", "flow/menu@-10", "flow/chat@0", "flow/menu@0", "words/alone", "words/quiet-6", "words/quiet-12"];
  const results: Record<string, unknown>[] = [];
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  for (const v of variants) {
    const rows = trials.map((tr) => ({ tr, r: replay(tr, v.p) }));
    const byGroup: Record<string, Record<string, unknown>> = {};
    for (const g of groups)
      for (const lang of ["en", "ko", "all"]) {
        const rs = rows.filter(({ tr }) => `${tr.set}/${tr.cell}` === g && (lang === "all" || tr.lang === lang));
        byGroup[`${g}/${lang}`] = {
          n: rs.length,
          endsPerSession: mean(rs.map(({ r }) => r.ends)),
          bysOnlyOpen: mean(rs.map(({ r }) => r.bysOnlyOpen)),
          bysOnlyAskOpen: mean(rs.map(({ r }) => r.bysOnlyAskOpen)),
          custKept: mean(rs.map(({ r }) => r.custKept)),
          closesInside: rs.reduce((a, { r }) => a + r.closesInside, 0),
          needsFallback: rs.filter(({ r }) => r.custKept !== null && r.custKept < 0.5).length,
          bystanderFirst: rs.filter(({ r }) => r.bystanderFirst).length,
        };
      }
    results.push({ variant: v.name, params: v.p, fallbackAtDb: { noAsk: fallbackAt(v.p, false), afterAsk: fallbackAt(v.p, true) }, groups: byGroup });
  }
  mkdirSync(join(HERE, "work"), { recursive: true });
  writeFileSync(join(HERE, "work", "screen.json"), JSON.stringify(results, null, 1));
  const pct = (x: unknown) => (x === null ? "  -" : `${Math.round(100 * (x as number))}`.padStart(3));
  console.log("flow cells, both languages (n 16 each): ends/session | bystander-only time open % | customer time open % | closes inside a sentence");
  console.log("words (n 24 each, cold): customer time open % (trials needing the fallback); fallback starts x dB under the anchor (no question / after one)");
  for (const r of results as { variant: string; fallbackAtDb: { noAsk: number | null; afterAsk: number | null }; groups: Record<string, Record<string, number | null>> }[]) {
    const f = groups.slice(0, 4).map((g) => {
      const x = r.groups[`${g}/all`];
      return `${(x.endsPerSession as number).toFixed(1).padStart(4)} ${pct(x.bysOnlyOpen)} ${pct(x.custKept)} ${String(x.closesInside).padStart(2)}`;
    });
    const w = groups.slice(4).map((g) => `${pct(r.groups[`${g}/all`].custKept)}(${r.groups[`${g}/all`].needsFallback})`);
    console.log(`${r.variant.padEnd(28)} | ${f.join(" | ")} | ${w.join(" ")} | ${r.fallbackAtDb.noAsk}/${r.fallbackAtDb.afterAsk}`);
  }
  const bf = (results[0] as { groups: Record<string, { bystanderFirst: number; n: number }> }).groups;
  console.log(`bystander talks first: ${groups.slice(0, 4).map((g) => `${g} ${bf[`${g}/all`].bystanderFirst}/${bf[`${g}/all`].n}`).join(", ")}`);
}

if (process.argv[1]?.endsWith("screen.ts")) main();
