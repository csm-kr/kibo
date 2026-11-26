// The multi-turn flow session (kibo-59, 11-27): an addition to the judge that leaves every existing trial, the
// manifest and the scoring untouched. Its own manifest (manifest-flow.json, version "flow-1") and refs
// (refs-flow.json), so the existing manifest's sha256, which every earlier log is keyed by, does not change.
//
// One trial = one Live session on a fixed timeline: 3 s of bystanders, then the customer's four turns (the hero
// order; "Make both fries large"; "No, thanks"; "That's all. I'll pay.") each 12 s after the end of the one before,
// so KIBO has time to answer, then 12 s more. Bystanders talk the whole time, one clip after another with short
// gaps. The review is answered by a tap in this design, so no voice turn follows "I'll pay".
// Cells: chat and menu talk (a neighbour discussing their own food from the same menu), at -10 and 0 dB against the
// customer (-20 dBFS); English and Korean; 8 trials each.
//
//   npx tsx spikes/speaker-gate/bench/build-flow.ts [--check]
// --check: rebuild in memory and compare every byte with what is on disk.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RATE, atLevel, decodeWav, encodeWav, rng, sha256, to16k, toInt16, trim } from "./audio";
import { FLOW_TURNS, MENU_TALK } from "./flow-sources";
import { BYSTANDER_VOICES, CUSTOMER_VOICES, HERO, type Lang, ttsFile } from "./sources";

export const FLOW_VERSION = "flow-1";
const SEED = 20261127;
const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
const CUSTOMER_DBFS = -20;
const LEAD_S = 3;
const GAP_S = 12;
const TAIL_S = 12;
const TRIALS = 8;
const LANGS: Lang[] = ["en", "ko"];
const CELLS = [
  { name: "chat@-10", content: "chat", levelDb: -10 },
  { name: "chat@0", content: "chat", levelDb: 0 },
  { name: "menu@-10", content: "menu", levelDb: -10 },
  { name: "menu@0", content: "menu", levelDb: 0 },
] as const;

const BYSTANDER_TEXT: Record<"chat" | "menu", (lang: Lang, i: number) => string> = {
  // The chat texts live in sources.ts as the bystanders' "chat" clips; read back from the clip list there.
  chat: (lang, i) => CHAT_TEXT[lang][i],
  menu: (lang, i) => MENU_TALK[lang][i],
};
// Copied from sources.ts CHATS (not exported there; the frozen file is not changed for this).
const CHAT_TEXT: Record<Lang, string[]> = {
  en: [
    "So I told him we should take the later train. It is cheaper anyway.",
    "Did you see the game last night? The second half was unbelievable.",
    "My sister is moving to a new apartment next month, near the river.",
    "I think it might rain later, so I brought an umbrella just in case.",
    "The meeting ran late again, and I still have to answer all my emails.",
    "We should book the hotel soon, before the prices go up for the holiday.",
  ],
  ko: [
    "아까 회의 진짜 길었지. 점심은 뭐 먹을까?",
    "어제 경기 봤어? 후반전이 정말 대단했어.",
    "우리 언니가 다음 달에 강 근처로 이사 간대.",
    "이따 비 올 것 같아서 우산 챙겨 왔어.",
    "오늘 회의가 또 늦게 끝나서 메일 답장을 아직 못 했어.",
    "연휴 전에 호텔 빨리 예약해야 가격이 안 올라.",
  ],
};

const pins: Record<string, string> = {};
function clip(voice: string, kind: Parameters<typeof ttsFile>[0]["kind"], lang: Lang): Float32Array {
  const name = ttsFile({ voice, kind, lang });
  const raw = readFileSync(join(BENCH, "audio/src/tts", name));
  pins[`tts/${name}`] = sha256(raw);
  const { rate, x } = decodeWav(raw);
  return trim(to16k(x, rate));
}

interface Span {
  startMs: number;
  endMs: number;
}

function buildTrial(lang: Lang, cell: (typeof CELLS)[number], k: number) {
  const seed = createHash("sha256").update(`${SEED}|flow|${lang}|${cell.name}|${k}`).digest().readUInt32LE(0);
  const r = rng(seed);
  const voice = CUSTOMER_VOICES[(k + (lang === "ko" ? 3 : 0)) % CUSTOMER_VOICES.length];
  const turns = [{ kind: "hero" as const, text: HERO[lang] }, ...FLOW_TURNS[lang]].map((t) => ({ ...t, x: atLevel(clip(voice, t.kind, lang), CUSTOMER_DBFS) }));
  let at = LEAD_S * RATE;
  const placed: (Span & { kind: string; text: string })[] = [];
  for (const t of turns) {
    placed.push({ kind: t.kind, text: t.text, startMs: (at / RATE) * 1000, endMs: ((at + t.x.length) / RATE) * 1000 });
    at += t.x.length + GAP_S * RATE;
  }
  const length = at - GAP_S * RATE + TAIL_S * RATE;
  const mix = new Float32Array(length);
  turns.forEach((t, i) => mix.set(t.x, Math.round((placed[i].startMs / 1000) * RATE)));
  // Bystanders: the six clips of the flavour in a seeded order, again and again, 0.3 to 1.2 s apart, from a seeded
  // start inside the first two seconds.
  const bys: (Span & { voice: string; text: string })[] = [];
  let b = Math.floor(r.next() * 2 * RATE);
  for (let round = 0; b < length; round++) {
    for (const i of r.shuffle([0, 1, 2, 3, 4, 5])) {
      if (b >= length) break;
      const bv = BYSTANDER_VOICES[i];
      const x = atLevel(clip(bv, cell.content, lang), CUSTOMER_DBFS + cell.levelDb);
      const n = Math.min(x.length, length - b);
      for (let j = 0; j < n; j++) mix[b + j] += x[j];
      bys.push({ voice: bv, text: BYSTANDER_TEXT[cell.content](lang, i), startMs: (b / RATE) * 1000, endMs: ((b + n) / RATE) * 1000 });
      b += x.length + Math.floor((0.3 + 0.9 * r.next()) * RATE);
    }
  }
  const { pcm, clipped } = toInt16(mix);
  const enrol = toInt16(atLevel(clip(voice, "enrol", lang), CUSTOMER_DBFS)).pcm;
  const ref = {
    set: "flow",
    lang,
    cell: cell.name,
    content: cell.content,
    levelDb: cell.levelDb,
    voices: "tts",
    customer: { voice, turns: placed },
    bystanders: bys,
    lengthMs: (length / RATE) * 1000,
    clippedSamples: clipped,
  };
  return { mix: encodeWav(pcm), enrol: encodeWav(enrol), ref };
}

function main() {
  const check = process.argv.includes("--check");
  const all: { lang: Lang; cell: (typeof CELLS)[number]; k: number }[] = [];
  for (const lang of LANGS) for (const cell of CELLS) for (let k = 0; k < TRIALS; k++) all.push({ lang, cell, k });
  const ids = rng(SEED + 1)
    .shuffle(all.map((_, i) => i))
    .map((i) => `f${String(i).padStart(4, "0")}`);
  const manifest = { version: FLOW_VERSION, seed: SEED, rate: RATE, trials: [] as { id: string; set: string; lengthMs: number; mix: string; enrol: string }[] };
  const refs = { version: FLOW_VERSION, seed: SEED, cells: {} as Record<string, string[]>, trials: {} as Record<string, unknown> };
  let mismatches = 0;
  all.forEach((t, n) => {
    const id = ids[n];
    const built = buildTrial(t.lang, t.cell, t.k);
    (refs.cells[`flow/${t.lang}/${t.cell.name}`] ??= []).push(id);
    refs.trials[id] = { id, ...built.ref };
    manifest.trials.push({ id, set: "flow", lengthMs: built.ref.lengthMs, mix: sha256(built.mix), enrol: sha256(built.enrol) });
    const inDir = join(BENCH, "inputs", id);
    if (check) {
      for (const [f, b] of [["mix.wav", built.mix], ["enrol.wav", built.enrol]] as const) if (!existsSync(join(inDir, f)) || sha256(readFileSync(join(inDir, f))) !== sha256(b)) mismatches++;
      return;
    }
    mkdirSync(inDir, { recursive: true });
    mkdirSync(join(BENCH, "refs", id), { recursive: true });
    writeFileSync(join(inDir, "mix.wav"), built.mix);
    writeFileSync(join(inDir, "enrol.wav"), built.enrol);
    writeFileSync(join(BENCH, "refs", id, "ref.json"), JSON.stringify(refs.trials[id], null, 1));
  });
  manifest.trials.sort((a, b) => a.id.localeCompare(b.id));
  if (check) {
    console.log(mismatches ? `--check: ${mismatches} files differ` : `--check: all ${all.length * 2} files match`);
    if (mismatches) process.exit(1);
    return;
  }
  writeFileSync(join(BENCH, "manifest-flow.json"), JSON.stringify(manifest, null, 1));
  writeFileSync(join(BENCH, "refs-flow.json"), JSON.stringify(refs, null, 1));
  writeFileSync(join(BENCH, "sources-flow.json"), JSON.stringify(pins, null, 1));
  console.log(`flow set: ${all.length} trials, manifest-flow.json sha256 ${sha256(readFileSync(join(BENCH, "manifest-flow.json")))}`);
}

if (process.argv[1]?.endsWith("build-flow.ts")) main();
