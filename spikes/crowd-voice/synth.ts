// Bystander clips for the crowd test: Gemini TTS, other voices than the fixtures' "Kore". No real person's voice.
// Run from the repo root: `npx tsx --env-file=.env spikes/crowd-voice/synth.ts`. Writes spikes/crowd-voice/audio/.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { readWav, trimToSpeech, ttsPcm, writeWav } from "../../scripts/wav";

const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
const TTS_RATE = 24_000;

export const CLIPS: { file: string; voice: string; text: string }[] = [
  // Small talk, nothing to do with the order.
  { file: "chat-en.wav", voice: "Puck", text: "So I told him we should take the later train. It is cheaper anyway, and we still get there before dinner." },
  { file: "chat-ko.wav", voice: "Aoede", text: "아까 회의 진짜 길었지. 점심은 뭐 먹을까? 나는 국수가 좋을 것 같아." },
  // The worst case in a queue: someone else ordering from the same menu.
  { file: "order-en.wav", voice: "Fenrir", text: "Can I get a spicy chicken burger and a large cola, please." },
  { file: "order-ko.wav", voice: "Charon", text: "저는 새우버거 하나랑 레몬에이드 주세요." },
  // A bystander's "yes" while the order review is open.
  { file: "yes-en.wav", voice: "Fenrir", text: "Yes. Yes, that's right." },
  { file: "yes-ko.wav", voice: "Charon", text: "네. 네, 맞아요." },
  // The user's own short yes (the fixtures' voice), to check the gate does not shut the user out.
  { file: "user-yes-en.wav", voice: "Kore", text: "Yes." },
  { file: "user-yes-ko.wav", voice: "Kore", text: "네." },
  // The rest of the hero order's turns in the user's voice, for the several-holds run (multi.ts).
  { file: "user-no-thanks-en.wav", voice: "Kore", text: "No, thanks." },
  { file: "user-pay-en.wav", voice: "Kore", text: "That's all. I'll pay." },
];

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const dir = join(process.cwd(), "spikes/crowd-voice/audio");
  mkdirSync(dir, { recursive: true });
  for (const c of CLIPS) {
    const out = join(dir, c.file);
    if (existsSync(out)) continue;
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: c.text }] }],
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } } },
    });
    const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new Error(`no audio for ${c.file}`);
    const raw = Buffer.from(b64, "base64");
    const { rate, samples } = raw.toString("ascii", 0, 4) === "RIFF" ? readWav(raw) : { rate: TTS_RATE, samples: ttsPcm(raw) };
    const speech = trimToSpeech(samples, rate, 150);
    writeFileSync(out, writeWav(speech, rate));
    console.log(`${c.file}: ${rate} Hz, ${(speech.length / rate).toFixed(2)} s`);
  }
}

main().catch((e) => {
  console.error("synth failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
