// Offline look at frame loudness (no network): how loud the fixture's 40 ms frames are, and what the gate sends.
// Run from the repo root: `npx tsx spikes/crowd-voice/levels.ts`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { frameRms } from "@/lib/voice/e2eMarks";
import { nearGate } from "./nearGate";
import { downsampleTo16k } from "@/lib/voice/pcm";
import { readWav } from "../../scripts/wav";

const RATE = 16000;
const FRAME = 640;

function load(path: string): Float32Array {
  const { rate, samples } = readWav(readFileSync(path));
  return Float32Array.from(downsampleTo16k(Float32Array.from(samples, (s) => s / 0x8000), rate), (s) => s / 0x8000);
}

function frames(x: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i + FRAME <= x.length; i += FRAME) out.push(x.subarray(i, i + FRAME));
  return out;
}

const db = (v: number) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "-inf");

for (const file of ["e2e/fixtures/hero-en.wav", "e2e/fixtures/hero-ko.wav", "spikes/crowd-voice/audio/user-yes-en.wav", "spikes/crowd-voice/audio/chat-en.wav"]) {
  const fs = frames(load(join(process.cwd(), file)));
  const rms = fs.map(frameRms);
  const peak = Math.max(...rms);
  const voiced = rms.filter((v) => v > peak * 0.0178).sort((a, b) => a - b);
  const q = (p: number) => voiced[Math.floor(voiced.length * p)];
  // Relative to the upper quartile, as the gate measures the user.
  const below9 = voiced.filter((v) => v < q(0.75) * 0.35).length;
  console.log(
    `${file}: ${fs.length} frames, voiced ${voiced.length}; p25 ${db(q(0.25) / q(0.75))} dB, p50 ${db(q(0.5) / q(0.75))} dB, p90 ${db(q(0.9) / q(0.75))} dB re p75; ` +
      `${below9} of ${voiced.length} voiced frames are more than 9 dB under p75`,
  );
  const g = nearGate();
  // Scaled so the upper quartile sits at 0.1 RMS, as in run.ts's -20 dBFS speech level, roughly.
  const k = 0.1 / q(0.75);
  let real = 0;
  let learnedAt = -1;
  let loud = 0;
  fs.forEach((f, i) => {
    const scaled = f.map((s) => s * k);
    if (frameRms(scaled) >= 0.04 * 0.35) loud++;
    if (loud === 13 && learnedAt < 0) learnedAt = i;
    real += g.push(scaled).filter((o) => o.some((s) => s !== 0)).length;
  });
  console.log(`   through the gate: ${real} of ${fs.length} frames sent as audio; 13 loud frames reached at frame ${learnedAt} (${(learnedAt * 0.04).toFixed(2)} s)`);
}
