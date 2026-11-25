// The same six sentences in eight Gemini TTS voices, for the speaker-gate kill test (docs/GOAL.md "Speaker gate"):
// same voice with different words against different voices with the same words. Synthetic voices, no real person.
// Run from the repo root: `npx tsx --env-file=.env spikes/speaker-gate/voices.ts`. Writes spikes/speaker-gate/audio/tts/
// as 16 kHz mono WAV (what the phone sends), speech only.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { downsampleTo16k } from "@/lib/voice/pcm";
import { readWav, trimToSpeech, ttsPcm, writeWav } from "../../scripts/wav";

const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
const TTS_RATE = 24_000;

export const VOICES = ["Kore", "Aoede", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"];
export const SENTENCES = [
  { id: "en1", text: "Two cheeseburger sets, please. One without pickles." },
  { id: "en2", text: "Make both fries large, and a zero cola." },
  { id: "en3", text: "That's all. I'll pay by card." },
  { id: "ko1", text: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고요." },
  { id: "ko2", text: "감자튀김은 둘 다 라지로 해 주세요." },
  { id: "ko3", text: "네, 맞아요. 카드로 계산할게요." },
];

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const dir = join(process.cwd(), "spikes/speaker-gate/audio/tts");
  mkdirSync(dir, { recursive: true });
  const jobs = VOICES.flatMap((voice) => SENTENCES.map((s) => ({ voice, ...s })));
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const out = join(dir, `${j.voice}-${j.id}.wav`);
      if (existsSync(out)) continue;
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: j.text }] }],
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: j.voice } } } },
      });
      const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!b64) throw new Error(`no audio for ${j.voice} ${j.id}`);
      const raw = Buffer.from(b64, "base64");
      const { rate, samples } = raw.toString("ascii", 0, 4) === "RIFF" ? readWav(raw) : { rate: TTS_RATE, samples: ttsPcm(raw) };
      const f = Float32Array.from(trimToSpeech(samples, rate, 150), (x) => x / 0x8000);
      writeFileSync(out, writeWav(downsampleTo16k(f, rate), 16000));
      console.log(out.split("/").pop());
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
}

if (process.argv[1]?.endsWith("voices.ts")) void main();
