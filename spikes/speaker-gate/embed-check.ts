// Kill test (docs/GOAL.md "Speaker gate", stage 1): does Gemini Embedding 2 on audio say who is speaking, or what
// was said? Eight TTS voices x six sentences (voices.ts). If speaker identity dominates, a clip's nearest neighbour
// is the same voice saying something else; if content dominates, it is another voice saying the same words.
// Run: npx tsx --env-file=.env spikes/speaker-gate/embed-check.ts [--model gemini-embedding-2]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

const i = process.argv.indexOf("--model");
const MODEL = i > 0 ? process.argv[i + 1] : "gemini-embedding-2";
const DIR = join(process.cwd(), "spikes/speaker-gate");

const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) { d += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; }
  return d / Math.sqrt(na * nb);
};

/** Probability that a random positive pair scores above a random negative pair. */
function auc(pos: number[], neg: number[]): number {
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const files = readdirSync(join(DIR, "audio/tts")).filter((f) => f.endsWith(".wav")).sort();
  const clips = files.map((f) => ({ file: f, voice: f.split("-")[0], sentence: f.split("-")[1].replace(".wav", "") }));
  const emb: number[][] = [];
  const ms: number[] = [];
  let next = 0;
  async function worker() {
    while (next < clips.length) {
      const k = next++;
      const data = readFileSync(join(DIR, "audio/tts", clips[k].file)).toString("base64");
      const t = performance.now();
      const res = await ai.models.embedContent({ model: MODEL, contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data } }] }] });
      ms.push(performance.now() - t);
      const v = res.embeddings?.[0]?.values;
      if (!v) throw new Error(`no embedding for ${clips[k].file}`);
      emb[k] = v;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const sameVoiceDiffWords: number[] = [], diffVoiceSameWords: number[] = [], diffVoiceDiffWords: number[] = [];
  for (let a = 0; a < clips.length; a++)
    for (let b = a + 1; b < clips.length; b++) {
      const c = cos(emb[a], emb[b]);
      const sv = clips[a].voice === clips[b].voice, ss = clips[a].sentence === clips[b].sentence;
      if (sv && !ss) sameVoiceDiffWords.push(c);
      else if (!sv && ss) diffVoiceSameWords.push(c);
      else if (!sv && !ss) diffVoiceDiffWords.push(c);
    }
  let nnVoice = 0, nnWords = 0;
  for (let a = 0; a < clips.length; a++) {
    let best = -1, bi = -1;
    for (let b = 0; b < clips.length; b++) if (b !== a) { const c = cos(emb[a], emb[b]); if (c > best) { best = c; bi = b; } }
    if (clips[bi].voice === clips[a].voice) nnVoice++;
    if (clips[bi].sentence === clips[a].sentence) nnWords++;
  }
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  ms.sort((a, b) => a - b);
  const out = {
    model: MODEL,
    clips: clips.length,
    dims: emb[0].length,
    meanCos: { sameVoiceDiffWords: mean(sameVoiceDiffWords), diffVoiceSameWords: mean(diffVoiceSameWords), diffVoiceDiffWords: mean(diffVoiceDiffWords) },
    aucSameVoiceVsSameWords: auc(sameVoiceDiffWords, diffVoiceSameWords),
    aucSameVoiceVsDiffBoth: auc(sameVoiceDiffWords, diffVoiceDiffWords),
    nearestIsSameVoice: `${nnVoice} of ${clips.length}`,
    nearestIsSameWords: `${nnWords} of ${clips.length}`,
    callMs: { median: Math.round(ms[Math.floor(ms.length / 2)]), max: Math.round(ms[ms.length - 1]) },
  };
  console.log(JSON.stringify(out, null, 1));
  mkdirSync(join(DIR, "logs"), { recursive: true });
  writeFileSync(join(DIR, "logs", `embed-check-${MODEL}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(out, null, 1));
}

void main();
