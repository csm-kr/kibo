// Synthetic voice fixtures for e2e/voice.live.spec.ts: Gemini TTS speaks fixed order sentences, saved as WAV
// (16-bit PCM mono at the TTS rate, 24 kHz, not resampled) with 1 s of silence before and 2 s after; the sentence is
// trimmed to 150 ms of quiet around the speech and faded in and out over 10 ms (`fixtureWav`, `scripts/wav.ts`).
// No real person's voice. Run with `npm run fixtures:voice` (reads GEMINI_API_KEY from .env). The key is never printed.
// `scripts/fixtures.test.ts` checks the files.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { fixtureWav, readWav, ttsPcm } from "./wav";

const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
// Headerless TTS replies were 16-bit little-endian PCM at 24 kHz; a WAV reply states its own rate.
const TTS_RATE = 24_000;

export const FIXTURES: { file: string; text: string }[] = [
  { file: "hero-en.wav", text: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." },
  { file: "fries-en.wav", text: "Make both fries large." },
  { file: "hero-ko.wav", text: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고, 음료는 제로콜라랑 사이다로요." },
];

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
    const { rate, samples } = raw.toString("ascii", 0, 4) === "RIFF" ? readWav(raw) : { rate: TTS_RATE, samples: ttsPcm(raw) };
    const out = fixtureWav(samples, rate);
    writeFileSync(join(dir, f.file), out);
    console.log(`${f.file}: ${rate} Hz, ${(samples.length / rate).toFixed(2)} s from TTS, ${((out.length - 44) / 2 / rate).toFixed(2)} s written`);
  }
}

main().catch((e) => {
  console.error("fixtures failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
