// Field level gap: reads one phone recording (the customer ordering at arm's length while the place goes on) and says
// how far the other talk sits under the customer and which gate depth to use. Runs the bench gate
// (spikes/speaker-gate/candidates/l1-loud/gate.ts: PICK + reachBack "near" + anchorRise) at depth 6, 5 and 4. No API.
// Scratch tool (kibo-fd, 11-27).
//
//   cd <repo root>; npx tsx <this file> <recording> [--customer 3-9.2,21.2-23.4] [--turns 2] [--clip 0.5-3.4]
//   (from the repo root: the bench imports use the repo's "@/" path alias and its tsx)
//
// <recording>: any file ffmpeg reads (m4a, wav, ...); it is converted to 16 kHz mono 16-bit, as the app hears it.
// --customer: when the customer spoke, in seconds. Best: listen and write them down. Without it the script takes the
//   --turns loudest speech stretches of 1.5 s or more (frames within 6 dB of the recording's 95th percentile, gaps
//   under 0.4 s bridged) as the customer's, and marks the answer PROVISIONAL. On a bench mix at a 9 dB gap a looser
//   version of this guess took neighbour speech for the customer and changed the answer: decide only with --customer.
//   For the TESTING.md layout (20 s customer, 20 s second person, 20 s room) pass --customer 0-20.
//
// Measures (40 ms frames, levels in dB of the recording's full scale):
// - customer level: 0.6 s chunks (75th percentile of their frames) centred inside the customer's times; the median of
//   the louder half (pauses dropped).
// - other talk: chunks wholly outside the customer's times (0.3 s margin). "Loud other talk" = their 90th percentile,
//   "loudest moment" = their maximum, "room" = their median. Gap = customer level minus loud other talk.
// - per depth: the customer's speech sent (customer frames within 15 dB of the customer level that fall inside the
//   gate's segments); other talk sent (frames outside the customer's turns, a turn being the customer's time plus the
//   gate's own 0.2 s lead and 1.0 s tail, that are 10 dB or more over the room floor, inside segments); the level the
//   gate learned first and last.
//
// - the greeting (only with --clip, or a /mic-test file name ending in -clip-<start>-<end>): the 90th percentile of
//   the frames while the greeting clip played against the same measure from the clip's end to the customer's first
//   word. The "ambient lead" gate sets its bar 4 dB over the level during the clip, so it holds only if the phone's
//   echo cancellation and gain control leave the room's talk at the same level while KIBO speaks. Shift over 2 dB
//   either way is flagged: higher during the clip = the bar is too high (customer may not be heard, the app offers
//   hold); lower = the bar is too low (the neighbour opens the gate, as today).
//
// The rule, written before any test run:
// 1. Gap under 6 dB: no depth helps (on the bench, at equal loudness nothing worked, a perfect press included):
//    recommend hold to talk at this spot.
// 2. Depth 6 sends less than 97% of the customer's speech: the customer is too quiet or uneven for the gate here:
//    hold to talk.
// 3. Otherwise a depth is usable when it sends at least 97% of the customer's speech and no less than depth 6 minus
//    1 point, and its last learned level is within 3 dB of the customer level. Take the shallowest usable depth
//    (4, then 5) only if it cuts other talk sent by at least 5 points against depth 6; else depth 6.
// Limits, printed with the answer: one recording, one phone; a voice recorder's automatic gain can narrow the gap the
// app would see; a real customer's level moves more than in one recording.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWav } from "../bench/audio";
import { frameDb, loudGate, PICK } from "../candidates/l1-loud/gate";

type Span = [number, number];
const RATE = 16000;
const F = 40;
const N = (RATE * F) / 1000;
const CHUNK = 15; // frames: 0.6 s, the gate's own chunk
const DEPTHS = [6, 5, 4];

const args = process.argv.slice(2);
const VALUED = ["--customer", "--turns", "--clip"];
const input = args.find((a) => !a.startsWith("--") && !VALUED.includes(args[args.indexOf(a) - 1]));
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (!input || !existsSync(input)) {
  console.error("usage: npx tsx levelgap.mts <recording> [--customer 3-9.2,21.2-23.4] [--turns 2] [--clip 0.5-3.4]");
  process.exit(2);
}

// Convert to what the app hears: 16 kHz, mono, 16-bit.
function load(path: string): Float32Array {
  const work = join(dirname(fileURLToPath(import.meta.url)), "work");
  mkdirSync(work, { recursive: true });
  const out = join(work, `${basename(path).replace(/\W+/g, "_")}.16k.wav`);
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", out]);
  } catch {
    const w = decodeWav(readFileSync(path));
    if (w.rate !== RATE) throw new Error(`ffmpeg failed and the file is ${w.rate} Hz, not ${RATE}`);
    return w.x;
  }
  return decodeWav(readFileSync(out)).x;
}

const x = load(input);
const db: number[] = [];
for (let i = 0; i + N <= x.length; i += N) db.push(frameDb(x.subarray(i, i + N)));
const lengthS = (db.length * F) / 1000;
const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};
const median = (xs: number[]) => pct(xs, 0.5);
const at = (i: number) => (i * F) / 1000; // frame index -> seconds (frame start)
const inside = (t: number, spans: Span[]) => spans.some(([a, b]) => t >= a && t < b);

// The customer's times: given, or the loudest speech stretches.
let customer: Span[];
let found = false;
const given = opt("--customer");
if (given) {
  customer = given.split(",").map((s) => s.split("-").map(Number) as Span);
  if (customer.some(([a, b]) => !(b > a))) throw new Error(`bad --customer: ${given}`);
} else {
  found = true;
  const turns = Number(opt("--turns") ?? 2);
  const loud = pct(db, 0.95) - 6;
  const runs: { s: number; e: number; level: number }[] = [];
  let s = -1;
  let last = -100;
  for (let i = 0; i <= db.length; i++) {
    const on = i < db.length && db[i] >= loud;
    if (on && s < 0) s = i;
    if (on) last = i;
    if (s >= 0 && (i === db.length || (!on && i - last > 10))) {
      if (last - s + 1 >= 38) runs.push({ s, e: last + 1, level: pct(db.slice(s, last + 1), 0.75) });
      s = -1;
    }
  }
  customer = runs
    .sort((a, b) => b.level - a.level)
    .slice(0, turns)
    .sort((a, b) => a.s - b.s)
    .map((r) => [at(r.s), at(r.e)] as Span);
  if (!customer.length) {
    console.error("No speech stretch of 1.5 s or more stands out. Give the customer's times with --customer.");
    process.exit(1);
  }
}

// Levels.
const chunks: { t: number; level: number }[] = [];
for (let i = 0; i + CHUNK <= db.length; i += CHUNK) chunks.push({ t: at(i), level: pct(db.slice(i, i + CHUNK), 0.75) });
const chunkLen = (CHUNK * F) / 1000;
const custChunks = chunks.filter((c) => inside(c.t + chunkLen / 2, customer)).map((c) => c.level);
const custLevel = median(custChunks.filter((l) => l >= median(custChunks)));
const margin: Span[] = customer.map(([a, b]) => [a - 0.3, b + 0.3]);
const otherChunks = chunks.filter((c) => !margin.some(([a, b]) => c.t < b && c.t + chunkLen > a)).map((c) => c.level);
const loudOther = pct(otherChunks, 0.9);
const loudest = Math.max(...otherChunks);
const room = median(otherChunks);
const floor = pct(db, 0.1);
const gap = custLevel - loudOther;

// The greeting clip's window against the stretch after it (see the header).
const AMBIENT_MARGIN_DB = 4;
const clipText = opt("--clip") ?? /-clip-(\d+(?:\.\d+)?-\d+(?:\.\d+)?)/.exec(basename(input))?.[1];
const clip = clipText ? (clipText.split("-").map(Number) as Span) : null;
if (clip && !(clip[1] > clip[0])) throw new Error(`bad --clip: ${clipText}`);
const loudIn = ([a, b]: Span) => pct(db.filter((_, i) => at(i) >= a && at(i) + F / 1000 <= b), 0.9);
const firstWord = Math.min(...customer.map(([a]) => a));
const duringClip = clip ? loudIn(clip) : NaN;
const afterClip = clip ? loudIn([clip[1] + 0.3, firstWord - 0.3]) : NaN;

// The gate at each depth.
const turnsMask: Span[] = customer.map(([a, b]) => [a - 0.2, b + 1.0]);
const custFrames = db.map((_, i) => i).filter((i) => inside(at(i) + F / 2000, customer) && db[i] >= custLevel - 15);
const otherTalk = db.map((_, i) => i).filter((i) => !inside(at(i) + F / 2000, turnsMask) && db[i] >= floor + 10);
const rows = DEPTHS.map((depthDb) => {
  const g = loudGate({ ...PICK, depthDb, reachBack: "near", anchorRise: true });
  let firstAt: number | null = null;
  let firstLevel: number | null = null;
  for (let i = 0; i < db.length; i++) {
    g.push(db[i]);
    if (firstAt === null && g.anchored()) {
      firstAt = at(i + 1);
      firstLevel = g.level();
    }
  }
  const segs = g.segments().map(([a, b]) => [a / 1000, b / 1000] as Span);
  const sent = (idx: number[]) => (idx.length ? (100 * idx.filter((i) => inside(at(i) + F / 2000, segs)).length) / idx.length : NaN);
  return { depthDb, custSent: sent(custFrames), otherSent: sent(otherTalk), firstAt, firstLevel, lastLevel: g.level(), rises: g.rises() };
});

// The rule.
const d6 = rows[0];
let pick: number | null = null;
let why: string;
if (!(gap >= 6)) {
  why =
    gap < 3
      ? `The other talk here is only ${gap.toFixed(1)} dB under the customer, about as loud. On our bench nothing worked at equal loudness, a perfect press included.`
      : `The other talk here is ${gap.toFixed(1)} dB under the customer. Our bench tested only 10 dB and 0 dB gaps, so this band is unmeasured; hold to talk is the safe choice until a field trial says otherwise.`;
} else if (!(d6.custSent >= 97)) {
  why = `Even at depth 6 the gate would send only ${d6.custSent.toFixed(0)}% of the customer's speech: the customer is too quiet or uneven for it here.`;
} else {
  const usable = rows.filter((r) => r.custSent >= 97 && r.custSent >= d6.custSent - 1 && r.lastLevel !== null && Math.abs(r.lastLevel - custLevel) <= 3);
  const shallow = usable.filter((r) => r.depthDb < 6 && d6.otherSent - r.otherSent >= 5).sort((a, b) => a.depthDb - b.depthDb)[0];
  pick = shallow ? shallow.depthDb : 6;
  why = shallow
    ? `Depth ${pick} still sends ${shallow.custSent.toFixed(0)}% of the customer's speech and cuts the other talk sent from ${d6.otherSent.toFixed(0)}% to ${shallow.otherSent.toFixed(0)}%.`
    : `A shallower depth would not cut the other talk sent by 5 points or more without costing the customer, so keep depth 6 (it sends ${d6.custSent.toFixed(0)}% of the customer and ${d6.otherSent.toFixed(0)}% of the other talk).`;
}

const f1 = (v: number | null) => (v === null || !Number.isFinite(v) ? "-" : v.toFixed(1));
const pc = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : "none").padStart(4);
const spanText = customer.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)} s`).join(", ");
console.log(`Recording: ${basename(input)}, ${lengthS.toFixed(1)} s, converted to 16 kHz mono`);
console.log(`Customer speaking: ${spanText}${found ? "  <- FOUND BY LOUDNESS, check by listening; if wrong, rerun with --customer" : " (given)"}`);
console.log("");
console.log("LEVELS (dB of the recording's full scale; only the differences matter)");
console.log(`  Customer speaking                ${f1(custLevel)}`);
console.log(`  Loud other talk (top 10%)        ${f1(loudOther)}   ${f1(gap)} dB under the customer`);
console.log(`  Loudest other moment             ${f1(loudest)}   ${f1(custLevel - loudest)} dB under the customer`);
console.log(`  The place in between (median)    ${f1(room)}`);
if (clip) {
  const shift = duringClip - afterClip;
  const bar = duringClip + AMBIENT_MARGIN_DB;
  console.log("");
  console.log(`WHILE THE GREETING PLAYED (${clip[0].toFixed(2)}-${clip[1].toFixed(2)} s)`);
  console.log(`  Loud level during the greeting   ${f1(duringClip)}`);
  console.log(`  Loud level after it, before you  ${f1(afterClip)}   (${clip[1].toFixed(1)}-${firstWord.toFixed(1)} s)`);
  if (!Number.isFinite(shift)) console.log("  Too little time between the greeting and the first order to compare.");
  else {
    console.log(
      `  Shift ${shift >= 0 ? "+" : ""}${shift.toFixed(1)} dB: ` +
        (Math.abs(shift) <= 2
          ? "the phone leaves the room at about the same level while KIBO speaks."
          : shift > 0
            ? "LOUDER during the greeting (KIBO's own voice left over, or gain raised). The bar would sit too high."
            : "QUIETER during the greeting (the phone pushed the room down). The bar would sit too low: the neighbour opens the gate."),
    );
    console.log(`  Bar from the greeting (+${AMBIENT_MARGIN_DB} dB)       ${f1(bar)}   customer ${f1(custLevel - bar)} dB over it, loud talk after the greeting ${f1(afterClip - bar)} dB over it`);
    console.log(`  ${custLevel - bar >= 3 && afterClip - bar <= 0 ? "The greeting bar would hear the customer and keep this talk out." : custLevel - bar < 3 ? "The greeting bar would not hear the customer reliably here." : "The greeting bar would let this talk through after the greeting."}`);
  }
}
console.log("");
console.log("WHAT THE GATE WOULD SEND TO KIBO WITHOUT A PRESS");
console.log("  depth | customer's speech sent | other talk sent | level it learned first (when) | level at the end");
for (const r of rows) {
  const first = r.firstAt === null ? "never" : `${f1(r.firstLevel)} (${r.firstAt.toFixed(1)} s)`;
  const off = r.firstLevel !== null && Math.abs(r.firstLevel - custLevel) > 3 ? "  <- not the customer's level" : "";
  console.log(`  ${r.depthDb} dB  | ${pc(r.custSent)}                   | ${pc(r.otherSent)}            | ${first.padEnd(28)} | ${f1(r.lastLevel)}${off}`);
}
console.log("");
console.log("ANSWER");
console.log((found ? "  PROVISIONAL (the customer's times were guessed): " : "  ") + (pick === null ? "Use hold to talk at this spot." : `Use depth ${pick}.`));
console.log(`  ${why}`);
console.log("  Limits: one recording on one phone. The app asks the browser for echo cancellation, noise suppression and");
console.log("  automatic gain (src/hooks/useLiveVoice.ts on feat/field-open); a voice recorder applies its own, so the gap the");
console.log("  app hears can differ. A real customer's level moves more than in one recording.");
console.log(
  "summary " +
    JSON.stringify({ file: basename(input), customer, found, clip, duringClip: +duringClip.toFixed(1), afterClip: +afterClip.toFixed(1), custLevel: +custLevel.toFixed(1), loudOther: +loudOther.toFixed(1), gap: +gap.toFixed(1), rows, pick }),
);
