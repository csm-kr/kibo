import { describe, expect, it } from "vitest";
import { cutTrailingBurst, fade, FIXTURE_LEAD_S, FIXTURE_TAIL_S, fixtureWav, readWav, trimToSpeech, ttsPcm, wavProblems, writeWav } from "./wav";

function wav(pcm: Buffer, extraChunk = false, opts: { dataSize?: number; trailer?: Buffer } = {}): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(24_000, 12);
  fmt.writeUInt32LE(48_000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
  const data = Buffer.alloc(8);
  data.write("data", 0);
  data.writeUInt32LE(opts.dataSize ?? pcm.length, 4);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, ...(extraChunk ? [list] : []), data, pcm, opts.trailer ?? Buffer.alloc(0)]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

/** A provenance chunk like the one gemini-3.8-flash-tts appends after `data` (id `C2PA`, JUMBF boxes inside). */
function c2paChunk(bytes = 6062): Buffer {
  const head = Buffer.alloc(8);
  head.write("C2PA", 0);
  head.writeUInt32LE(bytes, 4);
  return Buffer.concat([head, noiseBytes(bytes)]);
}

/** Deterministic random bytes: what a binary chunk sounds like when read as samples. */
function noiseBytes(n: number, seed = 7): Buffer {
  const out = Buffer.alloc(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x >> 16;
  }
  return out;
}

function tone(rate: number, ms: number, amp = 8000, hz = 220): Int16Array {
  const n = Math.round((rate * ms) / 1000);
  return Int16Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate)));
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function pcmBytes(s: Int16Array): Buffer {
  const b = Buffer.alloc(s.length * 2);
  s.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
}

const RATE = 24_000;

describe("ttsPcm", () => {
  const pcm = Buffer.from([1, 0, 2, 0, 0xff, 0x7f]);

  it("headerless PCM is returned as is", () => {
    expect(Array.from(ttsPcm(pcm))).toEqual([1, 2, 32767]);
  });

  it("a WAV header is stripped, so its 44 bytes do not become a click", () => {
    expect(Array.from(ttsPcm(wav(pcm)))).toEqual([1, 2, 32767]);
  });

  it("finds the data chunk after other chunks", () => {
    expect(Array.from(ttsPcm(wav(pcm, true)))).toEqual([1, 2, 32767]);
  });

  it("a chunk after `data` (the C2PA provenance manifest) is not read as samples", () => {
    expect(Array.from(ttsPcm(wav(pcm, false, { trailer: c2paChunk() })))).toEqual([1, 2, 32767]);
  });

  it.each([0xffffffff, 0])("with a streaming data size (%d) the data runs to the next chunk that ends the file", (dataSize) => {
    expect(Array.from(ttsPcm(wav(pcm, false, { dataSize, trailer: c2paChunk() })))).toEqual([1, 2, 32767]);
    expect(Array.from(ttsPcm(wav(pcm, false, { dataSize })))).toEqual([1, 2, 32767]);
  });
});

describe("writeWav and readWav", () => {
  it("writes a 44-byte PCM mono 16-bit header for the rate, sized to the data", () => {
    const out = writeWav(Int16Array.from([1, -2, 3]), RATE);
    expect(out.length).toBe(44 + 6);
    expect(out.toString("ascii", 0, 4)).toBe("RIFF");
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(out.readUInt32LE(16)).toBe(16);
    expect(out.readUInt16LE(20)).toBe(1);
    expect(out.readUInt16LE(22)).toBe(1);
    expect(out.readUInt32LE(24)).toBe(RATE);
    expect(out.readUInt32LE(28)).toBe(RATE * 2);
    expect(out.readUInt16LE(32)).toBe(2);
    expect(out.readUInt16LE(34)).toBe(16);
    expect(out.toString("ascii", 36, 40)).toBe("data");
    expect(out.readUInt32LE(40)).toBe(6);
    expect(readWav(out)).toEqual({ rate: RATE, samples: Int16Array.from([1, -2, 3]) });
  });

  it("reads the rate from the fmt chunk", () => {
    expect(readWav(wav(Buffer.from([5, 0]))).rate).toBe(24_000);
  });
});

describe("cutTrailingBurst", () => {
  const speech = concat(tone(RATE, 300), new Int16Array(RATE / 10));

  it("cuts a final full-scale noise burst after the speech", () => {
    const burst = ttsPcm(noiseBytes(6000));
    const out = cutTrailingBurst(concat(speech, burst), RATE);
    expect(out.length).toBeLessThanOrEqual(speech.length);
    expect(out.length).toBeGreaterThanOrEqual(tone(RATE, 300).length);
  });

  it("keeps speech that ends without a burst", () => {
    expect(cutTrailingBurst(speech, RATE).length).toBe(speech.length);
  });
});

describe("trimToSpeech", () => {
  it("cuts long silence on both sides down to the margin", () => {
    const voiced = tone(RATE, 300);
    const out = trimToSpeech(concat(new Int16Array(RATE / 2), voiced, new Int16Array(RATE / 2)), RATE, 100);
    expect(out.length).toBeGreaterThanOrEqual(voiced.length + RATE / 5 - RATE / 50);
    expect(out.length).toBeLessThanOrEqual(voiced.length + RATE / 5 + RATE / 50);
  });

  it("throws when there is no speech", () => {
    expect(() => trimToSpeech(new Int16Array(RATE), RATE, 100)).toThrow(/no speech/);
  });
});

describe("fade", () => {
  it("ramps the first and last 10 ms from zero and leaves the middle alone", () => {
    const flat = new Int16Array(RATE).fill(10_000);
    const out = fade(flat, RATE, 10);
    const n = RATE / 100;
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(out[n / 2]).toBeGreaterThan(4000);
    expect(out[n / 2]).toBeLessThan(6000);
    expect(out[n]).toBe(10_000);
    expect(out[RATE / 2]).toBe(10_000);
    expect(flat[0]).toBe(10_000);
  });
});

describe("fixtureWav and wavProblems", () => {
  // TTS-like: 150 ms quiet, a sentence, 200 ms quiet, then a C2PA chunk after `data`.
  const sentence = concat(new Int16Array(RATE * 0.15).fill(20), tone(RATE, 800, 12_000), new Int16Array(RATE / 5).fill(-15));
  const layout = { leadS: FIXTURE_LEAD_S, tailS: FIXTURE_TAIL_S };

  it("a TTS reply with a header and a trailing chunk becomes a clean fixture at its own rate", () => {
    const raw = wav(pcmBytes(sentence), false, { trailer: c2paChunk() });
    const out = fixtureWav(ttsPcm(raw), RATE);
    expect(readWav(out).rate).toBe(RATE);
    expect(wavProblems(out, layout)).toEqual([]);
  });

  it("finds the old generator's faults: header bytes as a click, a noise burst at the end", () => {
    // The 10-13 fixtures: the whole reply (header, samples, C2PA chunk) padded as samples.
    const raw = wav(pcmBytes(sentence), false, { trailer: c2paChunk() });
    const whole = new Int16Array(raw.length >> 1);
    for (let i = 0; i < whole.length; i++) whole[i] = raw.readInt16LE(i * 2);
    const old = writeWav(concat(new Int16Array(RATE * FIXTURE_LEAD_S), whole, new Int16Array(RATE * FIXTURE_TAIL_S)), RATE);
    const problems = wavProblems(old, layout).join("\n");
    expect(problems).toMatch(/start.*max/);
    expect(problems).toMatch(/end.*max/);
    expect(problems).toMatch(/jump/);
  });

  it("finds flat tops and a header whose size does not match the data", () => {
    const clipped = concat(new Int16Array(RATE), new Int16Array(RATE / 5), Int16Array.from([32767, 32767, 32767]), new Int16Array(RATE / 5), new Int16Array(RATE * 2));
    const out = writeWav(clipped, RATE);
    expect(wavProblems(out, layout).join("\n")).toMatch(/flat-top/);
    const short = Buffer.from(out);
    short.writeUInt32LE(out.readUInt32LE(40) - 2, 40);
    expect(wavProblems(short, layout).join("\n")).toMatch(/data size/);
  });
});
