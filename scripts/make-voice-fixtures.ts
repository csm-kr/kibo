// Synthetic voice fixtures for e2e/voice.live.spec.ts: Gemini TTS speaks fixed order sentences, saved as WAV
// (16-bit PCM mono, 48 kHz) with 1 s of silence before and 2 s after. No real person's voice.
// Run with `npm run fixtures:voice` (reads GEMINI_API_KEY from .env). The key is never printed.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
// Gemini TTS returns raw 16-bit little-endian PCM at 24 kHz.
const TTS_RATE = 24_000;
const OUT_RATE = 48_000;
const LEAD_S = 1;
const TAIL_S = 2;

export const FIXTURES: { file: string; text: string }[] = [
  { file: "hero-en.wav", text: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." },
  { file: "fries-en.wav", text: "Make both fries large." },
  { file: "hero-ko.wav", text: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고, 음료는 제로콜라랑 사이다로요." },
];

/** 24 kHz to 48 kHz by linear interpolation, padded with silence. */
function toWav(pcm24: Int16Array): Buffer {
  const speech = pcm24.length * 2;
  const total = (LEAD_S + TAIL_S) * OUT_RATE + speech;
  const samples = new Int16Array(total);
  const start = LEAD_S * OUT_RATE;
  for (let i = 0; i < speech; i++) {
    const pos = i / 2;
    const a = pcm24[Math.floor(pos)];
    const b = pcm24[Math.min(pcm24.length - 1, Math.floor(pos) + 1)];
    samples[start + i] = Math.round(a + (b - a) * (pos - Math.floor(pos)));
  }
  const data = Buffer.from(samples.buffer);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(OUT_RATE, 24);
  h.writeUInt32LE(OUT_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set (.env).");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const dir = join(process.cwd(), "e2e/fixtures");
  mkdirSync(dir, { recursive: true });
  for (const f of FIXTURES) {
    const res = await ai.models.generateContent({
      model: MODEL,
      // The sentence alone: a style prefix ("Say clearly: …") gets spoken too.
      contents: [{ role: "user", parts: [{ text: f.text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
    const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new Error(`no audio for ${f.file}`);
    const raw = Buffer.from(b64, "base64");
    const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
    writeFileSync(join(dir, f.file), toWav(pcm));
    console.log(`${f.file}: ${(pcm.length / TTS_RATE).toFixed(2)} s of speech`);
  }
}

main().catch((e) => {
  console.error("fixtures failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
