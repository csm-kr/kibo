// The loudness gate (gate.ts) over the benchmark, through the judge's file contract. Reads bench/inputs only and the
// voice-activity flags from vad.py (work/vad.json, or work/vad-<upstream>.json for a stack). Writes segments, no
// out.wav (absent means the mix, or the upstream candidate's out.wav when chained with --input-from).
//
//   npx tsx spikes/speaker-gate/candidates/l1-loud/run.ts --name l1-loud [--vad energy|silero] [--depth 6] [--warm]
//     [--input-from <cand>] [--set words|live|all]
// --vad energy (default): the gate's own level test on 40 ms frames, no model, the variant that could ship.
// --vad silero: Silero VAD flags from vad.py on 32 ms windows, for comparison (a model that is not Gemini).
// --warm: learn the customer's level from enrol.wav first (a warm start); default: cold, from the mix alone.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeWav, sha256 } from "../../bench/audio";
import { frameDb, loudGate } from "./gate";

const HERE = join(process.cwd(), "spikes/speaker-gate/candidates/l1-loud");
const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** Each frame's level in dBFS. */
function levels(x: Float32Array, frameMs: number): number[] {
  const n = (16000 * frameMs) / 1000;
  const out: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) out.push(frameDb(x.subarray(i, i + n)));
  return out;
}

function main() {
  const name = arg("name", "");
  if (!name) throw new Error("--name is required");
  const depth = Number(arg("depth", "6"));
  const vadKind = arg("vad", "energy");
  if (vadKind !== "energy" && vadKind !== "silero") throw new Error("--vad energy|silero");
  const frameMs = vadKind === "silero" ? 32 : 40;
  const warm = process.argv.includes("--warm");
  const from = arg("input-from", "");
  const which = arg("set", "all");
  const manifestRaw = readFileSync(join(BENCH, "manifest.json"));
  const trials = (JSON.parse(manifestRaw.toString()).trials as { id: string; set: string }[]).filter((t) => which === "all" || t.set === which);
  const vad: Record<string, { mix: string; enrol: string }> = vadKind === "silero" ? JSON.parse(readFileSync(join(HERE, "work", from ? `vad-${from}.json` : "vad.json"), "utf8")) : {};
  const outDir = join(BENCH, "out", name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "MANIFEST"), sha256(manifestRaw) + "\n");
  let opened = 0;
  for (const t of trials) {
    const src = from ? join(BENCH, "out", from, t.id, "out.wav") : join(BENCH, "inputs", t.id, "mix.wav");
    if (!existsSync(src) || (vadKind === "silero" && !vad[t.id])) throw new Error(`no audio or voice flags for ${t.id} (${from || "mix"})`);
    let x = decodeWav(readFileSync(src)).x;
    if (from) {
      // An upstream out.wav may start late and be short; on the mix's time base the rest is silence.
      const m = JSON.parse(readFileSync(join(BENCH, "out", from, t.id, "meta.json"), "utf8"));
      const mixLen = (readFileSync(join(BENCH, "inputs", t.id, "mix.wav")).length - 44) / 2;
      const full = new Float32Array(mixLen);
      full.set(x, Math.round(((m.out_offset_ms ?? 0) * 16000) / 1000));
      x = full;
    }
    const g = loudGate({ depthDb: depth, frameMs });
    const flag = (s: string | undefined, i: number) => (s === undefined ? undefined : s[i] === "1");
    if (warm) {
      const e = levels(decodeWav(readFileSync(join(BENCH, "inputs", t.id, "enrol.wav"))).x, frameMs);
      e.forEach((db, i) => g.learn(db, flag(vad[t.id]?.enrol, i)));
    }
    levels(x, frameMs).forEach((db, i) => g.push(db, flag(vad[t.id]?.mix, i)));
    const segments = g.segments().map(([s, e]) => [s, Math.min(e, (x.length / 16000) * 1000)]);
    if (segments.length) opened++;
    // Opening takes two frames; the pre-roll before them was held back (heldBack.ts) and goes out faster than
    // real time on the phone, which the judge does not model, so only the decision delay is declared.
    const meta = { latency_ms: 2 * frameMs, segments, ...(from ? { input_from: from } : {}), gate: { vad: vadKind, frameMs, depthDb: depth, warm } };
    mkdirSync(join(outDir, t.id), { recursive: true });
    writeFileSync(join(outDir, t.id, "meta.json"), JSON.stringify(meta) + "\n");
  }
  console.log(`out/${name}: ${trials.length} trials, gate opened in ${opened}`);
}

if (process.argv[1]?.endsWith("run.ts")) main();
