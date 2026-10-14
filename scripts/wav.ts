// Gemini TTS audio and the voice E2E fixtures, as 16-bit little-endian mono samples. Older TTS replies were headerless
// PCM; gemini-3.8-flash-tts wraps it in a WAV (RIFF) file whose `data` chunk is followed by a `C2PA` provenance chunk.
// Read as samples, the header is a click at the start and the C2PA chunk a full-scale noise burst at the end (I-124,
// I-237), so only the `data` chunk is audio.

const HEADER = 44;
/** A 10 ms window at or above this RMS is voiced: 1% of full scale, the same level as the E2E gate (`e2eMarks.ts`). */
const VOICED_RMS = 0.01 * 0x8000;
const WINDOW_MS = 10;

/** The fixture layout: digital silence before and after the sentence (`e2eMarks.ts` relies on both). */
export const FIXTURE_LEAD_S = 1;
export const FIXTURE_TAIL_S = 2;
/** Quiet kept around the sentence; every sample in it is below EDGE_MAX, so the sentence starts and ends quietly. */
const MARGIN_MS = 150;
const FADE_MS = 10;
/** The check on a fixture: its sentence's first and last EDGE_MS stay below EDGE_MAX. */
const EDGE_MS = 100;
const EDGE_MAX = 500;
const JUMP_MS = 50;
const JUMP_MAX = 1000;
const FLAT_TOP = 32_700;

function isFourCc(raw: Buffer, at: number): boolean {
  for (let i = at; i < at + 4; i++) if (raw[i] < 0x20 || raw[i] > 0x7e) return false;
  return true;
}

/** Where the `data` chunk ends when its size field is a streaming placeholder: at a chunk that exactly ends the file. */
function streamedDataEnd(raw: Buffer, start: number): number {
  for (let p = start; p + 8 <= raw.length; p += 2) {
    if (!isFourCc(raw, p)) continue;
    const size = raw.readUInt32LE(p + 4);
    const rest = raw.length - p;
    if (rest === 8 + size || rest === 8 + size + (size % 2)) return p;
  }
  return raw.length;
}

export function ttsPcm(raw: Buffer): Int16Array {
  let data = raw;
  if (raw.length >= 12 && raw.toString("ascii", 0, 4) === "RIFF" && raw.toString("ascii", 8, 12) === "WAVE") {
    // Chunks: 4-byte id, 4-byte size, payload padded to an even length.
    for (let at = 12; at + 8 <= raw.length; ) {
      const size = raw.readUInt32LE(at + 4);
      if (raw.toString("ascii", at, at + 4) === "data") {
        const start = at + 8;
        // 0 and 0xFFFFFFFF are what streaming writers leave when the length is not known yet.
        const streamed = size === 0 || size === 0xffffffff || start + size > raw.length;
        data = raw.subarray(start, streamed ? streamedDataEnd(raw, start) : start + size);
        break;
      }
      at += 8 + size + (size % 2);
    }
  }
  // Copy, so the samples are aligned whatever the chunk offset.
  const copy = Buffer.from(data.subarray(0, data.length - (data.length % 2)));
  return new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2);
}

/** A WAV file's rate and samples; it must be PCM, mono, 16-bit. */
export function readWav(raw: Buffer): { rate: number; samples: Int16Array } {
  if (raw.length < 12 || raw.toString("ascii", 0, 4) !== "RIFF" || raw.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  for (let at = 12; at + 8 <= raw.length; ) {
    const size = raw.readUInt32LE(at + 4);
    if (raw.toString("ascii", at, at + 4) === "fmt ") {
      if (raw.readUInt16LE(at + 8) !== 1 || raw.readUInt16LE(at + 10) !== 1 || raw.readUInt16LE(at + 22) !== 16) {
        throw new Error("not PCM mono 16-bit");
      }
      return { rate: raw.readUInt32LE(at + 12), samples: ttsPcm(raw) };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("no fmt chunk");
}

/** A 44-byte PCM mono 16-bit header and the samples. */
export function writeWav(samples: Int16Array, rate: number): Buffer {
  const out = Buffer.alloc(HEADER + samples.length * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => out.writeInt16LE(s, HEADER + i * 2));
  return out;
}

function rms(s: Int16Array): number {
  let sum = 0;
  for (const x of s) sum += x * x;
  return s.length ? Math.sqrt(sum / s.length) : 0;
}

/** Sign changes per sample: about 0.5 for random bytes, a few hundredths for a voice. */
function zeroCrossings(s: Int16Array): number {
  let n = 0;
  for (let i = 1; i < s.length; i++) if (s[i] < 0 !== s[i - 1] < 0) n++;
  return s.length > 1 ? n / (s.length - 1) : 0;
}

/**
 * Cuts a final burst of binary data read as samples (loud and noise-like: RMS ≥ 8000 and zero-crossing rate ≥ 0.25,
 * which no voice reaches), the way the C2PA chunk sounded at the end of the 10-13 fixtures.
 */
export function cutTrailingBurst(pcm: Int16Array, rate: number): Int16Array {
  const w = Math.round((rate * WINDOW_MS) / 1000);
  let out = pcm;
  for (;;) {
    let end = Math.ceil(out.length / w);
    while (end > 0 && rms(out.subarray((end - 1) * w, end * w)) < VOICED_RMS) end--;
    let start = end;
    while (start > 0 && rms(out.subarray((start - 1) * w, start * w)) >= VOICED_RMS) start--;
    if (start === end) return out;
    const run = out.subarray(start * w, end * w);
    if (rms(run) < 8000 || zeroCrossings(run) < 0.25) return out;
    out = out.subarray(0, start * w);
  }
}

/** The sentence from its first to its last sample at or above EDGE_MAX, with up to `marginMs` of the quieter audio around it. */
export function trimToSpeech(pcm: Int16Array, rate: number, marginMs: number): Int16Array {
  let first = 0;
  while (first < pcm.length && Math.abs(pcm[first]) < EDGE_MAX) first++;
  if (first === pcm.length) throw new Error("no speech in the audio");
  let last = pcm.length - 1;
  while (Math.abs(pcm[last]) < EDGE_MAX) last--;
  const margin = Math.round((rate * marginMs) / 1000);
  return pcm.subarray(Math.max(0, first - margin), Math.min(pcm.length, last + 1 + margin));
}

/** A copy with linear fades over the first and last `ms`, so the audio leaves and rejoins silence at zero. */
export function fade(pcm: Int16Array, rate: number, ms: number): Int16Array {
  const out = Int16Array.from(pcm);
  const n = Math.min(Math.round((rate * ms) / 1000), Math.floor(pcm.length / 2));
  for (let i = 0; i < n; i++) {
    out[i] = Math.round(pcm[i] * (i / n));
    out[pcm.length - 1 - i] = Math.round(pcm[pcm.length - 1 - i] * (i / n));
  }
  return out;
}

/** A fixture WAV at the TTS rate (no resampling): silence, the trimmed and faded sentence, silence. */
export function fixtureWav(pcm: Int16Array, rate: number): Buffer {
  const speech = fade(trimToSpeech(cutTrailingBurst(pcm, rate), rate, MARGIN_MS), rate, FADE_MS);
  const out = new Int16Array((FIXTURE_LEAD_S + FIXTURE_TAIL_S) * rate + speech.length);
  out.set(speech, FIXTURE_LEAD_S * rate);
  return writeWav(out, rate);
}

function maxAbs(s: Int16Array): number {
  let m = 0;
  for (const x of s) m = Math.max(m, Math.abs(x));
  return m;
}

function maxJump(s: Int16Array): number {
  let m = 0;
  for (let i = 1; i < s.length; i++) m = Math.max(m, Math.abs(s[i] - s[i - 1]));
  return m;
}

/** What is wrong with a fixture file: header, layout, flat tops, and a click or burst where the sentence meets the silence. */
export function wavProblems(raw: Buffer, layout: { leadS: number; tailS: number }): string[] {
  const ascii = (at: number) => raw.toString("ascii", at, at + 4);
  if (raw.length < HEADER || ascii(0) !== "RIFF" || ascii(8) !== "WAVE" || ascii(12) !== "fmt " || ascii(36) !== "data") {
    return ["not a 44-byte PCM WAV header (RIFF, WAVE, fmt , data)"];
  }
  const problems: string[] = [];
  const rate = raw.readUInt32LE(24);
  if (raw.readUInt32LE(16) !== 16 || raw.readUInt16LE(20) !== 1 || raw.readUInt16LE(22) !== 1 || raw.readUInt16LE(34) !== 16) {
    problems.push("fmt is not PCM mono 16-bit");
  }
  if (raw.readUInt32LE(28) !== rate * 2 || raw.readUInt16LE(32) !== 2) problems.push("byte rate or block align does not match the rate");
  if (raw.readUInt32LE(4) !== raw.length - 8) problems.push(`RIFF size ${raw.readUInt32LE(4)}, file has ${raw.length - 8}`);
  if (raw.readUInt32LE(40) !== raw.length - HEADER) problems.push(`data size ${raw.readUInt32LE(40)}, ${raw.length - HEADER} bytes follow the header`);
  const s = new Int16Array(Math.floor((raw.length - HEADER) / 2));
  for (let i = 0; i < s.length; i++) s[i] = raw.readInt16LE(HEADER + i * 2);

  const lead = layout.leadS * rate;
  const tail = layout.tailS * rate;
  if (s.length <= lead + tail) return [...problems, `only ${s.length} samples, not more than the ${layout.leadS + layout.tailS} s of silence`];
  if (maxAbs(s.subarray(0, lead)) > 0) problems.push(`lead: the first ${layout.leadS} s is not digital silence`);
  if (maxAbs(s.subarray(s.length - tail)) > 0) problems.push(`tail: the last ${layout.tailS} s is not digital silence`);

  let runs = 0;
  for (let i = 0, run = 0; i <= s.length; i++) {
    if (i < s.length && Math.abs(s[i]) >= FLAT_TOP) run++;
    else {
      if (run >= 3) runs++;
      run = 0;
    }
  }
  if (runs) problems.push(`${runs} flat-top runs (≥ 3 samples at |x| ≥ ${FLAT_TOP})`);

  const sentence = s.subarray(lead, s.length - tail);
  const edge = Math.round((rate * EDGE_MS) / 1000);
  const startMax = maxAbs(sentence.subarray(0, edge));
  const endMax = maxAbs(sentence.subarray(sentence.length - edge));
  if (startMax >= EDGE_MAX) problems.push(`start: max |x| ${startMax} in the sentence's first ${EDGE_MS} ms (want < ${EDGE_MAX})`);
  if (endMax >= EDGE_MAX) problems.push(`end: max |x| ${endMax} in the sentence's last ${EDGE_MS} ms (want < ${EDGE_MAX})`);
  // From the last silent sample into the sentence, and out of it into the first silent one.
  const j = Math.round((rate * JUMP_MS) / 1000);
  const startJump = maxJump(s.subarray(lead - 1, lead + j));
  const endJump = maxJump(s.subarray(s.length - tail - j, s.length - tail + 1));
  if (startJump > JUMP_MAX) problems.push(`start: a jump of ${startJump} between samples in the first ${JUMP_MS} ms (want ≤ ${JUMP_MAX})`);
  if (endJump > JUMP_MAX) problems.push(`end: a jump of ${endJump} between samples in the last ${JUMP_MS} ms (want ≤ ${JUMP_MAX})`);

  const w = Math.round((rate * WINDOW_MS) / 1000);
  let voiced = false;
  for (let at = 0; at < sentence.length && !voiced; at += w) voiced = rms(sentence.subarray(at, at + w)) >= VOICED_RMS;
  if (!voiced) problems.push("no speech between the lead and the tail");
  return problems;
}
