// Audio helpers for the benchmark: WAV in and out (mono or stereo, 16-bit), levels, trimming, a seeded random source.
// All resampling and mixing happens here in TypeScript, so the same sources and seed give the same bytes.

import { createHash } from "node:crypto";
import { downsampleTo16k } from "@/lib/voice/pcm";

export const RATE = 16000;

/** A 16-bit PCM WAV (any channel count) as mono floats at its own rate. */
export function decodeWav(raw: Buffer): { rate: number; x: Float32Array } {
  if (raw.length < 12 || raw.toString("ascii", 0, 4) !== "RIFF" || raw.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let rate = 0;
  let channels = 0;
  for (let at = 12; at + 8 <= raw.length; ) {
    const id = raw.toString("ascii", at, at + 4);
    let size = raw.readUInt32LE(at + 4);
    if (id === "fmt ") {
      if (raw.readUInt16LE(at + 8) !== 1 || raw.readUInt16LE(at + 22) !== 16) throw new Error("not 16-bit PCM");
      channels = raw.readUInt16LE(at + 10);
      rate = raw.readUInt32LE(at + 12);
    } else if (id === "data") {
      if (!rate) throw new Error("data before fmt");
      // ffmpeg writing to a pipe leaves the size unknown (0 or 0xFFFFFFFF): the data runs to the end.
      if (size === 0 || size === 0xffffffff || at + 8 + size > raw.length) size = raw.length - at - 8;
      const n = Math.floor(size / (2 * channels));
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += raw.readInt16LE(at + 8 + 2 * (i * channels + c));
        x[i] = s / channels / 0x8000;
      }
      return { rate, x };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

export function to16k(x: Float32Array, rate: number): Float32Array {
  if (rate === RATE) return x;
  return Float32Array.from(downsampleTo16k(x, rate), (s) => s / 0x8000);
}

export function toInt16(x: Float32Array): { pcm: Int16Array; clipped: number } {
  let clipped = 0;
  const pcm = Int16Array.from(x, (s) => {
    if (s > 1 || s < -1) clipped++;
    return Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff);
  });
  return { pcm, clipped };
}

export function encodeWav(pcm: Int16Array, rate = RATE): Buffer {
  const out = Buffer.alloc(44 + pcm.length * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + pcm.length * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) out.writeInt16LE(pcm[i], 44 + 2 * i);
  return out;
}

export const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

/** RMS over the 20 ms frames within 35 dB of the loudest one: the level of the speech, not of its pauses
 *  (spikes/crowd-voice/run.ts). */
export function speechRms(x: Float32Array): number {
  const n = RATE / 50;
  const e: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    e.push(s / n);
  }
  const thr = e.reduce((a, v) => Math.max(a, v), 0) * 10 ** (-35 / 10);
  const active = e.filter((v) => v > thr);
  return Math.sqrt(active.reduce((a, v) => a + v, 0) / Math.max(1, active.length));
}

export const dbfs = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-12));

export function atLevel(x: Float32Array, db: number): Float32Array {
  const g = 10 ** (db / 20) / Math.max(speechRms(x), 1e-12);
  return x.map((s) => s * g);
}

/** Without leading and trailing silence (35 dB under the peak), 100 ms kept on each side (run.ts). */
export function trim(x: Float32Array): Float32Array {
  const thr = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) * 10 ** (-35 / 20);
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return x.slice(Math.max(0, a - RATE / 10), Math.min(x.length, b + RATE / 10));
}

/** 20 ms frames above -35 dB of the loudest, joined across gaps under 300 ms: where someone speaks, in ms. */
export function speechSpans(x: Float32Array, offsetMs = 0): [number, number][] {
  const n = RATE / 50;
  const e: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    e.push(s / n);
  }
  const thr = e.reduce((a, v) => Math.max(a, v), 0) * 10 ** (-35 / 10);
  const spans: [number, number][] = [];
  e.forEach((v, k) => {
    if (v <= thr) return;
    const s = offsetMs + k * 20;
    const last = spans[spans.length - 1];
    if (last && s - last[1] < 300) last[1] = s + 20;
    else spans.push([s, s + 20]);
  });
  return spans;
}

/** mulberry32: a small seeded generator, so a seed always gives the same benchmark. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: T[]): T => xs[Math.floor(next() * xs.length)],
    shuffle: <T>(xs: T[]): T[] => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
