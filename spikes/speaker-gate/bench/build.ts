// Builds the frozen crowd benchmark (docs/GOAL.md "Speaker-aware listening", stage 1), version 2. Same sources and
// seed give the same bytes. Inputs a candidate may read go to inputs/<trial>/ (mix.wav, enrol.wav); references it may
// not read go to refs/<trial>/ (customer.wav: the customer's speech alone, starting at customer.startMs; ref.json).
// The noise alone is mix minus customer and is not stored (the disk is small). manifest.json (inputs and their
// sha256) and refs.json (cells, references and their sha256) are committed; the audio is not. sources.json pins every
// source file by sha256, because Gemini TTS and the corpora cannot be fetched again byte for byte: a build refuses
// sources that do not match. Each trial has its own seed (from its set, language, cell and index), so adding a cell
// later does not change the bytes of the others. Version 1 (one seed stream, mixed bystander talk): logs/v1/.
//
//   npx tsx spikes/speaker-gate/bench/build.ts --real ~/kibo-data/speaker-gate/data/real [--pin | --check]
// --pin writes sources.json from the files on disk (first build only); --check builds in memory and compares with
// manifest.json and refs.json, writing nothing.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RATE, atLevel, decodeWav, dbfs, encodeWav, rng, sha256, speechRms, speechSpans, to16k, toInt16, trim } from "./audio";
import { BYSTANDER_TEXTS, BYSTANDER_VOICES, CUSTOMER_TEXTS, CUSTOMER_VOICES, MUSIC, SONG_TEXTS, type Lang, type TtsText, ttsFile } from "./sources";

export const VERSION = 2;
export const SEED = 20261126;
const ROOT = process.cwd();
const BENCH = join(ROOT, "spikes/speaker-gate/bench");
/** The customer's enrolment and normal speech level. Every level in a cell name is relative to it. */
const ENROL_DBFS = -20;
const GAP_S = 0.4;
const ENROL_S = 3;
const MIN_FREE_BYTES = 500e6;
const LANGS: Lang[] = ["en", "ko"];

// ---- Cells ----

/** What the bystanders say: small talk, a rival order from the same menu, a yes on the order review, a voice-over
 *  of lyrics over music (stand-in for singing), real read speech (public corpora), four people at once, music. */
type Content = "chat" | "order" | "yes" | "song" | "read" | "babble" | "music" | "music+chat";

interface Cell {
  set: "words" | "live";
  name: string;
  /** What the customer says: the order sentence (long), a short answer, or nothing. */
  customer: "long" | "short" | null;
  /** The customer's level relative to their enrolment, dB (a customer who speaks more quietly than at first). */
  customerDb: number;
  content: Content | null;
  /** Bystander speech level relative to the customer's enrolment level, dB; docs/GOAL.md writes the negative as SIR. */
  levelDb: number | null;
  /** tts: Gemini TTS voices; real: public read speech; both: trials 0 to 5 TTS, 6 to 11 real. */
  voices: "tts" | "real" | "both";
  /** run.ts's review scenario: the order is in and the confirm card is open; only a bystander says yes. */
  review?: boolean;
}

const LEVELS = [-15, -10, -5, 0, 5];
const at = (l: number) => (l > 0 ? `+${l}` : `${l}`);

function wordCells(): Cell[] {
  const w = (name: string, c: Omit<Cell, "set" | "name">): Cell => ({ set: "words", name, ...c });
  const long = { customer: "long" as const, customerDb: 0 };
  return [
    w("alone", { ...long, content: null, levelDb: null, voices: "both" }),
    w("quiet-6", { customer: "long", customerDb: -6, content: null, levelDb: null, voices: "both" }),
    w("quiet-12", { customer: "long", customerDb: -12, content: null, levelDb: null, voices: "both" }),
    w("quiet-6+chat@-15", { customer: "long", customerDb: -6, content: "chat", levelDb: -15, voices: "tts" }),
    w("quiet-12+chat@-15", { customer: "long", customerDb: -12, content: "chat", levelDb: -15, voices: "tts" }),
    ...LEVELS.map((l) => w(`chat@${at(l)}`, { ...long, content: "chat", levelDb: l, voices: "tts" })),
    ...LEVELS.map((l) => w(`order@${at(l)}`, { ...long, content: "order", levelDb: l, voices: "tts" })),
    ...LEVELS.map((l) => w(`read@${at(l)}`, { ...long, content: "read", levelDb: l, voices: "real" })),
    ...[-10, 0].map((l) => w(`babble@${at(l)}`, { ...long, content: "babble", levelDb: l, voices: "both" })),
    ...[-10, 0, 5].map((l) => w(`song@${at(l)}`, { ...long, content: "song", levelDb: l, voices: "both" })),
    ...[-10, 0, 5].map((l) => w(`music@${at(l)}`, { ...long, content: "music", levelDb: l, voices: "both" })),
    w("music+chat@0", { ...long, content: "music+chat", levelDb: 0, voices: "tts" }),
    ...LEVELS.map((l) => w(`yes@${at(l)}`, { customer: null, customerDb: 0, content: "yes", levelDb: l, voices: "tts" })),
    w("silent+chat@0", { customer: null, customerDb: 0, content: "chat", levelDb: 0, voices: "tts" }),
    w("silent+order@0", { customer: null, customerDb: 0, content: "order", levelDb: 0, voices: "tts" }),
    w("silent+read@0", { customer: null, customerDb: 0, content: "read", levelDb: 0, voices: "real" }),
    w("short", { customer: "short", customerDb: 0, content: null, levelDb: null, voices: "tts" }),
    w("short+chat@-10", { customer: "short", customerDb: 0, content: "chat", levelDb: -10, voices: "tts" }),
    w("short+chat@0", { customer: "short", customerDb: 0, content: "chat", levelDb: 0, voices: "tts" }),
  ];
}

/** The Live layer's named subset (the full grid is too large for Live). */
function liveCells(): Cell[] {
  const l = (name: string, c: Pick<Cell, "content" | "levelDb">): Cell => ({ set: "live", name, customer: "long", customerDb: 0, voices: "tts", ...c });
  return [
    l("alone", { content: null, levelDb: null }),
    l("chat@-10", { content: "chat", levelDb: -10 }),
    l("chat@0", { content: "chat", levelDb: 0 }),
    l("order@-10", { content: "order", levelDb: -10 }),
    l("order@0", { content: "order", levelDb: 0 }),
    l("babble@0", { content: "babble", levelDb: 0 }),
    l("music@0", { content: "music", levelDb: 0 }),
    l("song@0", { content: "song", levelDb: 0 }),
    { set: "live", name: "review-yes@0", customer: null, customerDb: 0, content: "yes", levelDb: 0, voices: "tts", review: true },
  ];
}

const TRIALS = { words: 12, live: 20 };
const TIMING = { words: { leadS: 1, tailS: 1 }, live: { leadS: 5, tailS: 12 } };

// ---- Sources ----

interface Clip {
  key: string;
  who: string;
  text: string;
  kind: string;
  x: Float32Array;
}

const used = new Map<string, string>();
let pinned: Record<string, string> | null = null;

function pin(key: string, file: string) {
  if (used.has(key)) return;
  const h = sha256(readFileSync(file));
  if (pinned && pinned[key] !== h) throw new Error(`source ${key} does not match sources.json (refusing to build a different benchmark)`);
  used.set(key, h);
}

const cache = new Map<string, Clip>();
const ALL_TTS: TtsText[] = [...CUSTOMER_TEXTS, ...BYSTANDER_TEXTS, ...SONG_TEXTS];

function tts(voice: string, kind: TtsText["kind"], lang: Lang): Clip {
  const name = ttsFile({ voice, kind, lang });
  const key = `tts/${name}`;
  if (cache.has(key)) return cache.get(key)!;
  const file = join(BENCH, "audio/src/tts", name);
  pin(key, file);
  const { rate, x } = decodeWav(readFileSync(file));
  const text = ALL_TTS.find((t) => t.voice === voice && t.kind === kind && t.lang === lang)!.text;
  const clip = { key, who: `tts:${voice}`, text, kind, x: trim(to16k(x, rate)) };
  cache.set(key, clip);
  return clip;
}

interface RealRow {
  speaker: string;
  id: string;
  file: string;
  text: string;
}

function decodeReal(corpus: string, row: RealRow): Clip {
  const key = `${corpus}/${row.id}`;
  if (cache.has(key)) return cache.get(key)!;
  pin(key, row.file);
  // Lossless decoding only: the corpora are 16 kHz already; anything else is refused, not resampled.
  const p = spawnSync("ffmpeg", ["-v", "error", "-i", row.file, "-ac", "1", "-f", "wav", "-"], { maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error(`ffmpeg could not decode ${key}`);
  const { rate, x } = decodeWav(p.stdout);
  if (rate !== RATE) throw new Error(`${key} is ${rate} Hz`);
  const clip = { key, who: `${corpus}:${row.speaker}`, text: row.text, kind: "read", x: trim(x) };
  cache.set(key, clip);
  return clip;
}

const songs = new Map<number, Float32Array>();
function music(i: number): Float32Array {
  if (!songs.has(i)) {
    pin(MUSIC[i], join(ROOT, MUSIC[i]));
    const { rate, x } = decodeWav(readFileSync(join(ROOT, MUSIC[i])));
    songs.set(i, to16k(x, rate));
  }
  return songs.get(i)!;
}

type Pool = { corpus: string; speakers: Map<string, RealRow[]>; ids: string[] };

/** Speakers with their utterances of a usable length (by transcript length, so only picked ones are decoded). */
function realPool(realDir: string, lang: Lang): Pool {
  const corpus = lang === "en" ? "libri-en" : "zeroth-ko";
  const rows: RealRow[] = JSON.parse(readFileSync(join(realDir, `${corpus}.json`), "utf8"));
  const speakers = new Map<string, RealRow[]>();
  for (const r of rows) {
    const n = lang === "en" ? r.text.split(/\s+/).length : r.text.replace(/\s/g, "").length;
    if (lang === "en" ? n < 8 || n > 24 : n < 14 || n > 40) continue;
    speakers.set(r.speaker, [...(speakers.get(r.speaker) ?? []), r]);
  }
  for (const [s, us] of speakers) if (us.length < 3) speakers.delete(s);
  const sorted = new Map([...speakers].sort(([a], [b]) => a.localeCompare(b)));
  return { corpus, speakers: sorted, ids: [...sorted.keys()] };
}

type Rand = ReturnType<typeof rng>;

function realUtterance(pool: Pool, speaker: string, r: Rand, not: Set<string>, minS: number, maxS: number): Clip {
  for (const row of r.shuffle(pool.speakers.get(speaker)!)) {
    if (not.has(row.id)) continue;
    const clip = decodeReal(pool.corpus, row);
    const s = clip.x.length / RATE;
    if (s >= minS && s <= maxS) return clip;
  }
  throw new Error(`no usable utterance for ${pool.corpus} ${speaker}`);
}

/** A real speaker as a bystander: three of their utterances, read one after another. */
function realBystander(pool: Pool, speaker: string, r: Rand): Clip[] {
  const out: Clip[] = [];
  const seen = new Set<string>();
  while (out.length < 3) {
    const c = realUtterance(pool, speaker, r, seen, 2, 9);
    seen.add(c.key.split("/")[1]);
    out.push(c);
  }
  return out;
}

// ---- One trial ----

interface Placed {
  who: string;
  source: string;
  kind: string;
  text: string;
  startMs: number;
  endMs: number;
  complete: boolean;
}

/** One person's clips back to back with 0.4 s gaps from a random start. Whole: only whole clips (the word set, so every
 *  reference word was played); otherwise they run through the whole take, cut at its edges (run.ts). */
function track(clips: Clip[], length: number, r: Rand, whole: boolean, levelDb: number): { x: Float32Array; placed: Placed[] } {
  const x = new Float32Array(length);
  const placed: Placed[] = [];
  let pos = whole ? Math.round(r.next() * 0.8 * RATE) : -Math.round(r.next() * 2 * RATE);
  for (let i = r.int(clips.length); pos < length; i++) {
    const c = clips[i % clips.length];
    const y = atLevel(c.x, levelDb);
    if (whole && pos + y.length > length) break;
    for (let j = Math.max(0, -pos); j < y.length && pos + j < length; j++) x[pos + j] += y[j];
    placed.push({
      who: c.who,
      source: c.key,
      kind: c.kind,
      text: c.text,
      startMs: Math.round((Math.max(0, pos) / RATE) * 1000),
      endMs: Math.round((Math.min(length, pos + y.length) / RATE) * 1000),
      complete: pos >= 0 && pos + y.length <= length,
    });
    pos += y.length + Math.round(GAP_S * RATE);
  }
  return { x, placed };
}

interface Who {
  customer: Clip;
  enrol: Clip;
  /** Bystanders as people, each with their clips. */
  bystanders: Clip[][];
  song: Clip[];
  voices: "tts" | "real" | "mixed";
}

function trialSeed(cell: Cell, lang: Lang, k: number): number {
  return createHash("sha256").update(`${SEED}|${cell.set}|${lang}|${cell.name}|${k}`).digest().readUInt32LE(0);
}

function whoFor(cell: Cell, lang: Lang, k: number, pool: Pool, r: Rand): Who {
  const real = cell.voices === "real" || (cell.voices === "both" && k >= TRIALS.words / 2);
  const voice = CUSTOMER_VOICES[k % CUSTOMER_VOICES.length];
  const song = [tts(r.pick(SONG_TEXTS.filter((t) => t.lang === lang)).voice, "song", lang)];
  if (real) {
    const [cs, ...others] = r.shuffle(pool.ids);
    const customer = realUtterance(pool, cs, r, new Set(), 2.5, 9);
    const full = realUtterance(pool, cs, r, new Set([customer.key.split("/")[1]]), ENROL_S, 20);
    const enrol = { ...full, x: full.x.slice(0, ENROL_S * RATE) };
    const n = cell.content === "babble" ? 4 : 1;
    return { customer, enrol, bystanders: others.slice(0, n).map((s) => realBystander(pool, s, r)), song, voices: "real" };
  }
  const kind = cell.customer === "short" ? (k % 2 === 0 ? "short1" : "short2") : cell.set === "live" || k % 2 === 0 ? "hero" : "extra";
  const customer = tts(voice, kind, lang);
  const enrol = tts(voice, "enrol", lang);
  const bv = r.shuffle(BYSTANDER_VOICES);
  let bystanders: Clip[][];
  let voices: Who["voices"] = "tts";
  if (cell.content === "babble") {
    // Four people at once, each with one kind of talk: two order, two make small talk. The live set swaps the two
    // talkers for real read speech.
    bystanders = [tts(bv[0], "order", lang), tts(bv[1], "chat", lang), tts(bv[2], "order", lang), tts(bv[3], "chat", lang)].map((c) => [c]);
    if (cell.set === "live") {
      const rs = r.shuffle(pool.ids).slice(0, 2);
      bystanders[1] = realBystander(pool, rs[0], r);
      bystanders[3] = realBystander(pool, rs[1], r);
      voices = "mixed";
    }
  } else {
    const kindOf = cell.content === "music+chat" ? "chat" : cell.content;
    bystanders = kindOf === "chat" || kindOf === "order" || kindOf === "yes" ? [[tts(bv[0], kindOf, lang)]] : [];
  }
  return { customer, enrol, bystanders, song, voices };
}

interface Built {
  mix: Int16Array;
  enrol: Int16Array;
  customer: Int16Array | null;
  ref: Record<string, unknown>;
}

function makeTrial(cell: Cell, lang: Lang, who: Who, r: Rand): Built {
  const { leadS, tailS } = TIMING[cell.set];
  const lead = leadS * RATE;
  const c = atLevel(who.customer.x, ENROL_DBFS + cell.customerDb);
  const speaks = cell.customer !== null;
  const whole = cell.set === "words";
  let length: number;
  if (cell.review) length = 2 * RATE + who.bystanders[0][0].x.length + 8 * RATE;
  else {
    // The word set places whole bystander clips, so the take is at least as long as the longest one after its start.
    const longest = whole && cell.levelDb !== null ? Math.max(0, ...who.bystanders.flat().map((b) => b.x.length)) + RATE : 0;
    length = Math.max(lead + c.length + tailS * RATE, longest);
  }
  const customer = speaks ? c : null;
  let noise: Float32Array | null = null;
  let placed: Placed[] = [];
  let musicRef: object | null = null;
  if (cell.levelDb !== null) {
    const target = ENROL_DBFS + cell.levelDb;
    const n = new Float32Array(length);
    noise = n;
    const add = (y: Float32Array) => {
      for (let i = 0; i < length; i++) n[i] += y[i];
    };
    if (cell.review) {
      // run.ts review: 2 s of quiet, the bystander's yes, 8 s of quiet.
      const yes = who.bystanders[0][0];
      const y = atLevel(yes.x, target);
      n.set(y, 2 * RATE);
      placed = [{ who: yes.who, source: yes.key, kind: "yes", text: yes.text, startMs: 2000, endMs: Math.round(((2 * RATE + y.length) / RATE) * 1000), complete: true }];
    } else if (cell.content === "babble") {
      // Four people at once, their sum at the target level.
      const ts = who.bystanders.map((p) => track(p, length, r, whole, -20));
      const sum = new Float32Array(length);
      for (const t of ts) for (let i = 0; i < length; i++) sum[i] += t.x[i];
      add(atLevel(sum, target));
      placed = ts.flatMap((t) => t.placed);
    } else {
      // Music with a voice-over (song) or a bystander: each 3 dB under the target, so the two together are at it.
      const withMusic = cell.content === "music" || cell.content === "song" || cell.content === "music+chat";
      const each = withMusic && cell.content !== "music" ? target - 3 : target;
      if (cell.content !== "music") {
        // A song runs through the whole take, cut at its edges (its lines are longer than a word-set trial).
        const song = cell.content === "song";
        const t = track(song ? who.song : who.bystanders[0], length, r, whole && !song, each);
        add(t.x);
        placed = t.placed;
      }
      if (withMusic) {
        const m = r.int(MUSIC.length);
        const s = music(m);
        const offset = r.int(s.length - length);
        add(atLevel(s.slice(offset, offset + length), each));
        musicRef = { file: MUSIC[m], offsetMs: Math.round((offset / RATE) * 1000), levelDb: Math.round((each - ENROL_DBFS) * 10) / 10 };
      }
    }
  }
  const mix = new Float32Array(length);
  if (noise) mix.set(noise);
  if (customer) for (let i = 0; i < customer.length; i++) mix[lead + i] += customer[i];
  const custSpans = customer ? speechSpans(customer, leadS * 1000) : [];
  // Overlap: share of the customer's speech frames where the noise is within 15 dB of its own level.
  let overlap: number | null = null;
  if (customer && noise) {
    const thr = 10 ** ((ENROL_DBFS + cell.levelDb! - 15) / 20);
    const fr = RATE / 50;
    let inSpeech = 0;
    let hit = 0;
    for (const [s, e] of custSpans)
      for (let t = s; t + 20 <= e; t += 20) {
        const i0 = (t * RATE) / 1000;
        let p = 0;
        for (let j = i0; j < i0 + fr; j++) p += noise[j] * noise[j];
        inSpeech++;
        if (Math.sqrt(p / fr) > thr) hit++;
      }
    overlap = Math.round((hit / Math.max(1, inSpeech)) * 1000) / 1000;
  }
  const mixQ = toInt16(mix);
  return {
    mix: mixQ.pcm,
    enrol: toInt16(atLevel(who.enrol.x, ENROL_DBFS)).pcm,
    customer: customer ? toInt16(customer).pcm : null,
    ref: {
      set: cell.set,
      lang,
      cell: cell.name,
      content: cell.content,
      levelDb: cell.levelDb,
      sirDb: cell.levelDb === null ? null : -cell.levelDb,
      customerDb: cell.customerDb,
      review: cell.review ?? false,
      voices: who.voices,
      customer: customer
        ? { who: who.customer.who, source: who.customer.key, kind: who.customer.kind, text: who.customer.text, startMs: leadS * 1000, endMs: Math.round(((lead + c.length) / RATE) * 1000), speechSpans: custSpans }
        : null,
      enrol: { who: who.enrol.who, source: who.enrol.key },
      bystanders: placed,
      music: musicRef,
      noiseLevelDbfs: noise ? Math.round(dbfs(speechRms(noise)) * 10) / 10 : null,
      overlap,
      clippedSamples: mixQ.clipped,
      lengthMs: Math.round((length / RATE) * 1000),
    },
  };
}

function buildTrial(cell: Cell, lang: Lang, k: number, pool: Pool): Built {
  const r = rng(trialSeed(cell, lang, k));
  const who = whoFor(cell, lang, k, pool, r);
  // With a customer and talk over them, the noise must overlap their speech; draw it again if not.
  for (let attempt = 0; attempt < 30; attempt++) {
    const t = makeTrial(cell, lang, who, r);
    const ov = t.ref.overlap as number | null;
    const needs = ov !== null && cell.content !== "music" && cell.content !== "song";
    if (!needs || ov >= (cell.set === "live" ? 0.6 : 0.3)) return t;
  }
  throw new Error(`no draw met the overlap floor: ${cell.set} ${lang} ${cell.name} ${k}`);
}

// ---- Main ----

function main() {
  const i = process.argv.indexOf("--real");
  if (i < 0) throw new Error("--real <dir with libri-en.json and zeroth-ko.json> is required");
  const realDir = process.argv[i + 1].replace(/^~/, process.env.HOME ?? "~");
  const pinFile = join(BENCH, "sources.json");
  const doPin = process.argv.includes("--pin");
  const check = process.argv.includes("--check");
  if (!doPin) {
    if (!existsSync(pinFile)) throw new Error("sources.json is missing: run once with --pin");
    pinned = JSON.parse(readFileSync(pinFile, "utf8")).sources;
  }
  const jobs = LANGS.flatMap((lang) => [...wordCells(), ...liveCells()].flatMap((cell) => Array.from({ length: TRIALS[cell.set] }, (_, k) => ({ cell, lang, k }))));
  // Opaque ids: trials are numbered in a shuffled order per set, so an id says nothing about its cell.
  const ids = new Map<(typeof jobs)[number], string>();
  const r = rng(SEED + VERSION);
  for (const set of ["words", "live"] as const) {
    const js = jobs.filter((j) => j.cell.set === set);
    r.shuffle(js.map((_, n) => n)).forEach((n, k) => ids.set(js[k], `${set === "words" ? "w" : "l"}${String(n).padStart(4, "0")}`));
  }
  if (!check) for (const d of ["inputs", "refs"]) rmSync(join(BENCH, d), { recursive: true, force: true });
  const pools = { en: realPool(realDir, "en"), ko: realPool(realDir, "ko") };
  const manifest: { id: string; set: string; lengthMs: number; mix: string; enrol: string }[] = [];
  const refs: Record<string, object> = {};
  const cells: Record<string, string[]> = {};
  let bytes = 0;
  for (const j of jobs) {
    const id = ids.get(j)!;
    const t = buildTrial(j.cell, j.lang, j.k, pools[j.lang]);
    const mix = encodeWav(t.mix);
    const enrol = encodeWav(t.enrol);
    const files: Record<string, string> = {};
    const customer = t.customer ? encodeWav(t.customer) : null;
    if (customer) files.customer = sha256(customer);
    if (!check) {
      const st = statfsSync(BENCH);
      if (st.bavail * st.bsize < MIN_FREE_BYTES) throw new Error(`under ${MIN_FREE_BYTES / 1e6} MB free on disk: stopped after ${manifest.length} trials`);
      mkdirSync(join(BENCH, "inputs", id), { recursive: true });
      mkdirSync(join(BENCH, "refs", id), { recursive: true });
      writeFileSync(join(BENCH, "inputs", id, "mix.wav"), mix);
      writeFileSync(join(BENCH, "inputs", id, "enrol.wav"), enrol);
      if (customer) writeFileSync(join(BENCH, "refs", id, "customer.wav"), customer);
    }
    bytes += mix.length + enrol.length + (customer?.length ?? 0);
    const ref = { id, ...t.ref, files };
    if (!check) writeFileSync(join(BENCH, "refs", id, "ref.json"), JSON.stringify(ref, null, 1));
    refs[id] = ref;
    manifest.push({ id, set: j.cell.set, lengthMs: t.ref.lengthMs as number, mix: sha256(mix), enrol: sha256(enrol) });
    // Cells list trials in run order: run k of a cell is always the same trial, for every candidate.
    (cells[`${j.cell.set}/${j.lang}/${j.cell.name}`] ??= []).push(id);
  }
  manifest.sort((a, b) => a.id.localeCompare(b.id));
  const manifestText = JSON.stringify({ version: VERSION, seed: SEED, rate: RATE, note: "Inputs a candidate may read. score.ts refuses to run if a file differs.", trials: manifest }, null, 1) + "\n";
  const refsText = JSON.stringify({ version: VERSION, seed: SEED, enrolDbfs: ENROL_DBFS, cells, trials: refs }, null, 1) + "\n";
  if (check) {
    const same = (f: string, text: string) => readFileSync(join(BENCH, f), "utf8") === text;
    const ok = same("manifest.json", manifestText) && same("refs.json", refsText);
    console.log(`check: ${ok ? "same bytes as" : "DIFFERENT from"} manifest.json and refs.json (${jobs.length} trials)`);
    if (!ok) process.exit(1);
    return;
  }
  if (doPin) {
    const sources = Object.fromEntries([...used].sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(pinFile, JSON.stringify({ note: "sha256 of every source file the benchmark was built from", sources }, null, 1) + "\n");
  }
  writeFileSync(join(BENCH, "manifest.json"), manifestText);
  writeFileSync(join(BENCH, "refs.json"), refsText);
  console.log(`${jobs.length} trials, ${Object.keys(cells).length} cells, ${(bytes / 1e6).toFixed(0)} MB audio, ${used.size} sources`);
  console.log(`manifest sha256 ${sha256(Buffer.from(manifestText))}`);
}

main();
