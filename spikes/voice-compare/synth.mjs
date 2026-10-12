// Step 1: synthesize the dataset with Gemini TTS (3 voices), resample to 16 kHz mono, pad, and make a noisy copy at ~10 dB SNR.
// Run: node --env-file=<repo>/.env synth.mjs   (reads GEMINI_API_KEY; never prints it)
// Output: audio/tts/*.wav (24 kHz originals, cached), audio/clean/*.wav, audio/noisy/*.wav, audio/clips.json
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, writeWav, resample, pinkNoise, power, speechBounds, rng } from './lib/audio.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
const RATE = 16000;
const LEAD_S = 0.3; // a little silence before speech
const TAIL_S = 1.0; // 1 s silence after speech (required)
const SNR_DB = 10;
const BABBLE_DB = -6; // babble power relative to the pink noise, before the whole noise bed is scaled to the SNR

import { VOICES } from './synth-voices.mjs';
export { VOICES };

const dataset = JSON.parse(readFileSync(join(ROOT, 'dataset.json'), 'utf8')).utterances;
for (const d of ['audio/tts', 'audio/clean', 'audio/noisy']) mkdirSync(join(ROOT, d), { recursive: true });

async function tts(ai, text, voice) {
  const prompt = voice.style ? `${voice.style} ${text}` : text;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } } },
      });
      const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) throw new Error('no audio');
      const raw = Buffer.from(part.inlineData.data, 'base64');
      // This model returns a WAV container (mimeType audio/wav); older ones returned raw 24 kHz PCM.
      if (raw.toString('latin1', 0, 4) === 'RIFF') return raw;
      return writeWav(Int16ToFloat(raw), 24000);
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
function Int16ToFloat(raw) {
  const n = Math.floor(raw.length / 2), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

/** Write only when the bytes differ, so re-running after one TTS file was regenerated touches only the affected clips. */
function writeIfChanged(f, buf) {
  if (existsSync(f) && readFileSync(f).equals(buf)) return false;
  writeFileSync(f, buf);
  console.log('wrote', f.split('/').slice(-2).join('/'));
  return true;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const jobs = dataset.flatMap((u) => VOICES.map((v) => ({ u, v })));
  // 1) TTS (cached)
  await pool(jobs, 4, async ({ u, v }) => {
    const f = join(ROOT, 'audio/tts', `${u.id}_${v.key}.wav`);
    if (existsSync(f)) return;
    const wav = await tts(ai, u.text, v);
    writeFileSync(f, wav);
    console.log('tts', u.id, v.key);
  });
  // 2) resample to 16 kHz, trim TTS edge silence, pad
  const speech = new Map();
  for (const { u, v } of jobs) {
    const { rate, samples } = readWav(readFileSync(join(ROOT, 'audio/tts', `${u.id}_${v.key}.wav`)));
    const x = resample(samples, rate, RATE);
    const b = speechBounds(x, RATE);
    const pad = Math.round(0.05 * RATE); // keep 50 ms around the detected speech
    speech.set(`${u.id}_${v.key}`, x.subarray(Math.max(0, b.start - pad), Math.min(x.length, b.end + pad)));
  }
  const clips = [];
  const keys = [...speech.keys()];
  for (const { u, v } of jobs) {
    const key = `${u.id}_${v.key}`;
    const s = speech.get(key);
    const lead = Math.round(LEAD_S * RATE), tail = Math.round(TAIL_S * RATE);
    const clean = new Float32Array(lead + s.length + tail);
    // Normalize speech to about -20 dBFS RMS so all voices start at the same level.
    const g = Math.sqrt(10 ** (-20 / 10) / power(s));
    for (let i = 0; i < s.length; i++) clean[lead + i] = s[i] * g;
    writeIfChanged(join(ROOT, 'audio/clean', `${key}.wav`), writeWav(clean, RATE));

    // 3) noise bed: pink noise + babble of 3 other utterances (other ids), overlapped at random offsets
    const seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const r = rng(seed);
    const n = clean.length;
    const pink = pinkNoise(n, seed);
    const pg = Math.sqrt(1 / power(pink));
    const babble = new Float32Array(n);
    const others = keys.filter((k) => !k.startsWith(u.id + '_'));
    const picked = [];
    while (picked.length < 3) { const k = others[Math.floor(r() * others.length)]; if (!picked.includes(k)) picked.push(k); }
    for (const k of picked) {
      const o = speech.get(k);
      const og = Math.sqrt(1 / power(o));
      let pos = -Math.floor(r() * o.length); // start partway through, loop to fill
      while (pos < n) {
        for (let i = 0; i < o.length; i++) { const t = pos + i; if (t >= 0 && t < n) babble[t] += o[i] * og; }
        pos += o.length + Math.floor(r() * 0.3 * RATE);
      }
    }
    const bg = Math.sqrt((10 ** (BABBLE_DB / 10)) / Math.max(1e-12, power(babble)));
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = pink[i] * pg + babble[i] * bg;
    // SNR is measured against the speech segment only (not the padding).
    const ps = power(clean, lead, lead + s.length);
    const ng = Math.sqrt(ps / (10 ** (SNR_DB / 10)) / power(noise));
    const noisy = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) { noisy[i] = clean[i] + noise[i] * ng; peak = Math.max(peak, Math.abs(noisy[i])); }
    if (peak > 0.99) for (let i = 0; i < n; i++) noisy[i] *= 0.99 / peak;
    writeIfChanged(join(ROOT, 'audio/noisy', `${key}.wav`), writeWav(noisy, RATE));

    const speechEndS = (lead + s.length) / RATE;
    for (const cond of ['clean', 'noisy']) {
      clips.push({ clipId: `${key}_${cond}`, uttId: u.id, lang: u.lang, voice: v.key, cond,
        file: `audio/${cond}/${key}.wav`, durationS: +(n / RATE).toFixed(3), speechStartS: LEAD_S, speechEndS: +speechEndS.toFixed(3),
        babbleFrom: cond === 'noisy' ? picked : undefined });
    }
  }
  writeFileSync(join(ROOT, 'audio/clips.json'), JSON.stringify({ rate: RATE, snrDb: SNR_DB, babbleDb: BABBLE_DB, ttsModel: MODEL, voices: VOICES, createdAt: new Date().toISOString(), clips }, null, 1));
  console.log('clips', clips.length);
}

main().catch((e) => { console.error('synth failed:', e?.message ?? e); process.exit(1); });
