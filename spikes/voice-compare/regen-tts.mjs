// Re-synthesize TTS files where the style tag "[slowly, elderly voice]" was spoken aloud (seen once: ko15_gacrux_slow).
// Each new take is checked with a Gemini Flash transcription and a Chirp 3 transcription; a take where either contains the
// tag words (in English or Korean transliteration) is discarded. One Flash check alone missed a spoken tag once.
// node --env-file=<repo>/.env regen-tts.mjs ko15_gacrux_slow [...]   then rerun synth.mjs and re-run changed clips (run.mjs --only).
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from './synth-voices.mjs';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(ROOT, 'dataset.json'), 'utf8')).utterances;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TAG = /slow|elder|voice|천천히|노인|슬로우|엘더|엘돌|보이스/i;
async function chirp(wav, lang) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const r = await fetch('https://us-speech.googleapis.com/v2/projects/kibo-2026/locations/us/recognizers/_:recognize', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': 'kibo-2026', 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { autoDecodingConfig: {}, languageCodes: [lang === 'ko' ? 'ko-KR' : 'en-US'], model: 'chirp_3' }, content: wav.toString('base64') }) });
  const j = await r.json();
  return (j.results ?? []).map((x) => x.alternatives?.[0]?.transcript ?? '').join(' ');
}
for (const key of process.argv.slice(2)) {
  const u = dataset.find((d) => key.startsWith(d.id + '_'));
  const v = VOICES.find((x) => key === `${u.id}_${x.key}`);
  let ok = false;
  for (let attempt = 1; attempt <= 10 && !ok; attempt++) {
    const r = await ai.models.generateContent({ model: 'gemini-3.8-flash-tts', contents: [{ role: 'user', parts: [{ text: v.style ? `${v.style} ${u.text}` : u.text }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voiceName } } } } });
    const wav = Buffer.from(r.candidates[0].content.parts.find((p) => p.inlineData?.data).inlineData.data, 'base64');
    const t = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }, { text: 'Transcribe exactly, including any English words. Output only the transcript.' }] }] });
    const flash = (t.text ?? '').trim(), ch = await chirp(wav, u.lang);
    const text = `${flash} || chirp: ${ch}`;
    // Also reject any extra words before the sentence (one take began with "살살", the tag rendered in Korean).
    const head = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3);
    ok = !TAG.test(text) && head(flash) === head(u.text) && head(ch) === head(u.text);
    console.log(key, 'attempt', attempt, ok ? 'ok' : 'tag spoken', '|', text);
    if (ok) {
      const f = join(ROOT, 'audio/tts', `${key}.wav`);
      if (existsSync(f)) renameSync(f, join(ROOT, 'dev/regen', `${key}.rejected.wav`));
      writeFileSync(f, wav);
    }
  }
}
