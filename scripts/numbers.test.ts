import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/plan/NUMBERS.md is the one source for every published number, and each of its values must come from its
// evidence file (R-001). This recomputes the values from the committed files and fails when the two disagree, so an
// evidence file can no longer change without NUMBERS.md changing with it (I-099, I-238, R-021).

const root = process.cwd();
const json = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const numbers = readFileSync(join(root, "docs/plan/NUMBERS.md"), "utf8");

/** The NUMBERS.md headline row whose claim starts with `claim`. */
function row(claim: string): string {
  const line = numbers.split("\n").find((l) => l.startsWith(`| ${claim}`));
  if (!line) throw new Error(`no row "${claim}" in docs/plan/NUMBERS.md`);
  return line;
}

/** The voice spec's median (e2e/voice.live.spec.ts): the mean of the middle two, rounded. */
function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const ms = (n: number) => n.toLocaleString("en-US");
const sec = (n: number) => (n / 1000).toFixed(1);

interface VoiceRun {
  at: string;
  pass: boolean;
  connected?: boolean;
  fixtures?: string;
  aMs: number | null;
  bMs: number | null;
}
interface VoiceFile {
  summary: { fixtures: string; aMedianMs: number; bMedianMs: number };
  allAttempts: { attempted: number; passed: number; upstreamFailures: number };
  omitted: { runs: number; passed: number; upstream: number }[];
  runs: VoiceRun[];
}

// I-422 (10-18) moved end of speech from 0.7 s to 1.0 s of silence. The files' summary spans every run on the current
// fixtures, so the published medians count only the runs measured since then.
const SINCE_SILENCE_1S = "2026-10-18T13:00:00Z";

function voice(path: string) {
  const file = json(path) as VoiceFile;
  const passed = file.runs.filter((r) => r.pass && r.fixtures === file.summary.fixtures);
  const pick = (runs: VoiceRun[], k: "aMs" | "bMs") => runs.flatMap((r) => (r[k] === null ? [] : [r[k]]));
  const now = passed.filter((r) => r.at >= SINCE_SILENCE_1S);
  const attempted = file.runs.length + file.omitted.reduce((n, o) => n + o.runs, 0);
  const ok = file.runs.filter((r) => r.pass).length + file.omitted.reduce((n, o) => n + o.passed, 0);
  return {
    file,
    a: median(pick(passed, "aMs")),
    b: median(pick(passed, "bMs")),
    aNow: median(pick(now, "aMs")),
    bNow: median(pick(now, "bMs")),
    attempted,
    ok,
  };
}

describe("docs/plan/NUMBERS.md matches the evidence files", () => {
  const direct = voice("evidence/voice-e2e.json");
  const relay = voice("evidence/voice-e2e-relay.json");

  it("each voice file's summary and allAttempts agree with its own runs", () => {
    for (const v of [direct, relay]) {
      expect(v.file.summary.aMedianMs).toBe(v.a);
      expect(v.file.summary.bMedianMs).toBe(v.b);
      expect(v.file.allAttempts.attempted).toBe(v.attempted);
      expect(v.file.allAttempts.passed).toBe(v.ok);
    }
  });

  it("voice: end of speech → kiosk highlight, direct and relay", () => {
    const r = row("Voice hero order, end of speech → kiosk highlight");
    expect(r).toContain(`**${ms(direct.bNow)} ms** median direct`);
    expect(r).toContain(`**${ms(relay.bNow)} ms** through the Vertex AI relay`);
  });

  it("voice: end of speech → first AI audio, direct and relay", () => {
    const r = row("Voice hero order, end of speech → first AI audio");
    expect(r).toContain(`**${ms(direct.aNow)} ms** median direct`);
    expect(r).toContain(`**${ms(relay.aNow)} ms** relay`);
  });

  it("voice: attempts and passes held in the two files", () => {
    const r = row("Voice attempts on record");
    expect(r).toContain(`**${direct.attempted + relay.attempted} attempted, ${direct.ok + relay.ok} passed**`);
    expect(r).toContain(`direct ${direct.attempted} / ${direct.ok}, relay ${relay.attempted} / ${relay.ok}`);
  });

  it("bridge replay: min–max of the verified commands", () => {
    const { commands } = json("evidence/bridge-replay.json") as { commands: { replayMs: number; ok: boolean }[] };
    const replay = commands.filter((c) => c.ok).map((c) => c.replayMs);
    expect(row("Bridge replay inside the app")).toContain(`**${Math.min(...replay)}–${Math.max(...replay)} ms** per command`);
  });

  it("typed latency: full order sentences and short follow-ups, beside the all-turn median", () => {
    const file = json("evidence/prod-latency.json") as {
      turns: { ms: number; actions: string[] }[];
      summary: { medianMs: number; p90Ms: number };
    };
    // A full order sentence adds two or more items in one turn; everything else is a short follow-up.
    const full = file.turns.filter((t) => t.actions.filter((a) => a === "addToCart:ok").length >= 2).map((t) => t.ms);
    const short = file.turns.filter((t) => !full.includes(t.ms)).map((t) => t.ms);
    expect(full.length + short.length).toBe(file.turns.length);
    const span = (v: number[]) => `median **${sec(median(v))} s** (${sec(Math.min(...v))}–${sec(Math.max(...v))} s)`;
    const r = row("Typed latency on the deployed service");
    expect(r).toContain(`**full order sentence** (the ${full.length} turns that add two sets) ${span(full)}`);
    expect(r).toContain(`**short follow-ups** (the other ${short.length}: dine option, both fries large, "I'll pay") ${span(short)}`);
    expect(r).toContain(`all ${file.turns.length} turns median ${sec(file.summary.medianMs)} s, p90 ${sec(file.summary.p90Ms)} s`);
  });
});
