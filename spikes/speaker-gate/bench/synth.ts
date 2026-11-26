// Gemini TTS sources for the crowd benchmark (bench/build.ts): customers say the hero order, an enrolment sentence
// and one more order sentence; bystanders say a rival order from the same menu and small talk. Synthetic voices only.
// Gemini TTS does not return the same bytes twice, so build.ts pins every source by sha256 (sources.json); run this
// only to create missing files, never to replace ones the manifest was built from.
// Run from the repo root: `npx tsx --env-file=.env spikes/speaker-gate/bench/synth.ts`. Writes bench/audio/src/tts/.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { readWav, trimToSpeech, ttsPcm, writeWav } from "../../../scripts/wav";
import { FLOW_TEXTS } from "./flow-sources";
import { BYSTANDER_TEXTS, CUSTOMER_TEXTS, SONG_TEXTS, ttsFile } from "./sources";

const MODEL = "gemini-3.8-flash-tts";
const TTS_RATE = 24_000;

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const dir = join(process.cwd(), "spikes/speaker-gate/bench/audio/src/tts");
  mkdirSync(dir, { recursive: true });
  const jobs = [...CUSTOMER_TEXTS, ...BYSTANDER_TEXTS, ...SONG_TEXTS, ...FLOW_TEXTS];
  let next = 0;
  let failed = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const out = join(dir, ttsFile(j));
      if (existsSync(out)) continue;
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: j.text }] }],
          config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: j.voice } } } },
        });
        const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
        if (!b64) throw new Error("no audio");
        const raw = Buffer.from(b64, "base64");
        const { rate, samples } = raw.toString("ascii", 0, 4) === "RIFF" ? readWav(raw) : { rate: TTS_RATE, samples: ttsPcm(raw) };
        writeFileSync(out, writeWav(trimToSpeech(samples, rate, 150), rate));
        console.log(ttsFile(j));
      } catch (e) {
        failed++;
        console.log(`${ttsFile(j)}: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (failed) process.exit(1);
}

void main();
