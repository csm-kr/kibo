// Speech-recognition adapters. Each returns { transcript, latencyMs, extra } or throws.
// Google systems are product candidates; every other system is an OFFLINE COMPARISON, NOT USED IN THE PRODUCT.
// Keys come from the environment only and are never printed or written.
import { GoogleGenAI, Modality } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { readWav, toPcm16, resample } from './audio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHUNK_MS = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- menu hints (from menu data only, plus generic order words; nothing taken from the test references) ----------
function menuPath() {
  const candidates = [process.env.MENU, join(ROOT, '../../data/kiosks/malo.json'), '/Users/sungmincho_mac/Desktop/sm/apps/kibo/data/kiosks/malo.json'];
  return candidates.find((p) => p && existsSync(p));
}
let hintCache;
export function menuHints(lang) {
  if (!hintCache) {
    const menu = JSON.parse(readFileSync(menuPath(), 'utf8'));
    const ko = new Set(['세트', '라지세트', '단품', '포장', '매장', '결제', '취소', '라지']);
    const en = new Set(['set', 'large set', 'burger only', 'to go', 'pay']);
    for (const it of menu.items) {
      ko.add(it.name.ko); en.add(it.name.en);
      for (const g of it.optionGroups ?? []) for (const o of g.options) { ko.add(o.name.ko); en.add(o.name.en); }
    }
    // Drop bare size letters ("M", "L"): useless as hints.
    hintCache = { ko: [...ko].filter((s) => s.length > 1), en: [...en].filter((s) => s.length > 1) };
  }
  return hintCache[lang];
}

// ---------- shared streaming pacer ----------
/** Sends 40 ms chunks paced like a microphone: chunk k (audio k*40..(k+1)*40 ms) goes out at start+(k+1)*40 ms,
 *  so audio time t (s) maps to wall time start + t*1000. After the clip, it keeps sending the clip's last second
 *  (silence or noise) until isDone() or the timeout. `start` is the caller's performance.now() at stream start. */
async function pace(samples, rate, send, { start, isDone, timeoutAfterClipMs, onClipEnd }) {
  const ch = Math.round((rate * CHUNK_MS) / 1000);
  const tail = samples.subarray(Math.max(0, samples.length - rate));
  let k = 0;
  for (let i = 0; i < samples.length; i += ch, k++) {
    const wait = start + (k + 1) * CHUNK_MS - performance.now();
    if (wait > 0) await sleep(wait);
    if (isDone()) return;
    send(samples.subarray(i, i + ch));
  }
  onClipEnd?.();
  const clipEnd = performance.now();
  for (let j = 0; !isDone() && performance.now() - clipEnd < timeoutAfterClipMs; j++, k++) {
    const wait = start + (k + 1) * CHUNK_MS - performance.now();
    if (wait > 0) await sleep(wait);
    const off = (j * ch) % Math.max(ch, tail.length - ch);
    send(tail.subarray(off, off + ch));
  }
}

// ---------- Gemini Live family (bidiGenerateContent) ----------
async function geminiLive(clip, { model, config }) {
  const { rate, samples } = readWav(readFileSync(join(ROOT, clip.file)));
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const ev = { pieces: [], lastAt: null, firstModelAt: null, genAt: null, turnAt: null, vadEndAt: null, vadEndOffset: null, setup: false, error: null, closed: false };
  let start = null;
  const now = () => (start == null ? 0 : performance.now() - start);
  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onmessage: (m) => {
        if (m.setupComplete) ev.setup = true;
        const c = m.serverContent;
        if (c?.inputTranscription?.text) { ev.pieces.push(c.inputTranscription.text); ev.lastAt = now(); }
        if (c?.modelTurn && ev.firstModelAt == null) ev.firstModelAt = now();
        if (m.toolCall && ev.firstModelAt == null) ev.firstModelAt = now();
        if (c?.generationComplete && ev.genAt == null) ev.genAt = now();
        if (c?.turnComplete && ev.turnAt == null) ev.turnAt = now();
        if (m.voiceActivity?.type === 'ACTIVITY_END' && ev.vadEndAt == null) { ev.vadEndAt = now(); ev.vadEndOffset = m.voiceActivity.audioOffset; }
      },
      onerror: (e) => { ev.error ??= e?.message ?? 'socket error'; },
      onclose: (e) => { ev.closed = true; if (e.code !== 1000) ev.error ??= `close ${e.code} ${String(e.reason).slice(0, 200)}`; },
    },
  });
  try {
    const t0 = performance.now();
    while (!ev.setup && !ev.closed && performance.now() - t0 < 15000) await sleep(20);
    if (!ev.setup) throw new Error(ev.error ?? 'no setupComplete');
    let clipEndAt = Infinity;
    const isDone = () => {
      if (ev.closed || ev.error) return true;
      const t = now();
      if (t < clipEndAt) return false;
      // A slow speaker's pauses split one clip into several turns: wait for a piece that arrived after the end of speech.
      const fresh = ev.lastAt != null && ev.lastAt >= clip.speechEndMs - 200;
      if (fresh && (ev.genAt != null || ev.turnAt != null) && t - ev.lastAt >= 700) return true;
      if (ev.pieces.length && t - Math.max(ev.lastAt, clipEndAt) >= 4000) return true; // nothing more is coming
      return false;
    };
    start = performance.now();
    await pace(samples, rate, (s) => session.sendRealtimeInput({ audio: { data: toPcm16(s).toString('base64'), mimeType: `audio/pcm;rate=${rate}` } }),
      { start, isDone, timeoutAfterClipMs: 12000, onClipEnd: () => { clipEndAt = now(); } });
  } finally {
    session.close();
  }
  if (ev.error && !ev.pieces.length) throw new Error(ev.error);
  const endMs = clip.speechEndMs;
  return {
    transcript: ev.pieces.join('').trim(),
    latencyMs: ev.lastAt != null ? Math.round(ev.lastAt - endMs) : null,
    extra: {
      pieces: ev.pieces.length,
      firstModelOutputMs: ev.firstModelAt != null ? Math.round(ev.firstModelAt - endMs) : null,
      vadEndMs: ev.vadEndAt != null ? Math.round(ev.vadEndAt - endMs) : null,
      vadEndOffset: ev.vadEndOffset,
      timedOut: !ev.pieces.length,
      error: ev.error ?? undefined,
    },
  };
}

const LIVE_SYSTEM = 'You are a kiosk ordering assistant. Listen.';

// ---------- Gemini batch ----------
async function geminiBatch(clip, { model }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const wav = readFileSync(join(ROOT, clip.file));
  const t0 = performance.now();
  const r = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }, { text: 'Transcribe exactly. Output only the transcript.' }] }],
  });
  return { transcript: (r.text ?? '').trim(), latencyMs: Math.round(performance.now() - t0), extra: { thoughtsTokens: r.usageMetadata?.thoughtsTokenCount } };
}

// ---------- Google Cloud Speech-to-Text v2, Chirp 3 ----------
let tok = { value: null, at: 0 };
function gcloudToken() {
  if (!tok.value || Date.now() - tok.at > 30 * 60e3) tok = { value: execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim(), at: Date.now() };
  return tok.value;
}
const GCP_PROJECT = process.env.GCP_PROJECT ?? 'kibo-2026';
const CHIRP_LOCATION = process.env.CHIRP_LOCATION ?? 'us'; // chirp_3 is not available in asia-northeast1 for ko-KR (403), nor in "global"
async function chirp3(clip, { hints }) {
  const wav = readFileSync(join(ROOT, clip.file));
  const config = { autoDecodingConfig: {}, languageCodes: [clip.lang === 'ko' ? 'ko-KR' : 'en-US'], model: 'chirp_3' };
  if (hints) config.adaptation = { phraseSets: [{ inlinePhraseSet: { phrases: menuHints(clip.lang).map((value) => ({ value, boost: 10 })) } }] };
  const url = `https://${CHIRP_LOCATION}-speech.googleapis.com/v2/projects/${GCP_PROJECT}/locations/${CHIRP_LOCATION}/recognizers/_:recognize`;
  const t0 = performance.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gcloudToken()}`, 'x-goog-user-project': GCP_PROJECT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, content: wav.toString('base64') }),
  });
  const latencyMs = Math.round(performance.now() - t0);
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.status ?? ''} ${String(j.error?.message ?? '').slice(0, 200)}`);
  const transcript = (j.results ?? []).map((x) => x.alternatives?.[0]?.transcript ?? '').join(' ').trim();
  return { transcript, latencyMs, extra: {} };
}

// ---------- OpenAI (offline comparison, not used in the product) ----------
async function openaiBatch(clip, { model }) {
  const wav = readFileSync(join(ROOT, clip.file));
  const fd = new FormData();
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  fd.append('model', model);
  const t0 = performance.now();
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
  const latencyMs = Math.round(performance.now() - t0);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.code ?? ''} ${String(j.error?.message ?? '').slice(0, 160)}`);
  return { transcript: (j.text ?? '').trim(), latencyMs, extra: { languages: j.languages } };
}

/** Realtime transcription session over WebSocket. gpt-live-transcribe has no server VAD, so the client commits
 *  the buffer once the clip (speech + 1 s silence) has been sent, like a client-side end-of-speech detector would. */
async function openaiRealtime(clip, { model }) {
  const { rate, samples } = readWav(readFileSync(join(ROOT, clip.file)));
  const OUT_RATE = 24000;
  const ws = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
  const ev = { ready: false, deltas: [], lastDeltaAt: null, completed: null, completedAt: null, error: null, closed: false };
  let start = null;
  const now = () => (start == null ? 0 : performance.now() - start);
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'session.updated') ev.ready = true;
    else if (m.type === 'conversation.item.input_audio_transcription.delta') { ev.deltas.push(m.delta); ev.lastDeltaAt = now(); }
    else if (m.type === 'conversation.item.input_audio_transcription.completed') { ev.completed = (ev.completed ?? '') + m.transcript; ev.completedAt = now(); }
    else if (m.type === 'error') ev.error ??= `${m.error?.code ?? ''} ${String(m.error?.message ?? '').slice(0, 200)}`;
  });
  ws.on('error', (e) => { ev.error ??= e.message; });
  ws.on('close', () => { ev.closed = true; });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  try {
    ws.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription', audio: { input: { format: { type: 'audio/pcm', rate: OUT_RATE }, transcription: { model }, turn_detection: null } } } }));
    const t0 = performance.now();
    while (!ev.ready && !ev.error && performance.now() - t0 < 10000) await sleep(20);
    if (!ev.ready) throw new Error(ev.error ?? 'no session.updated');
    let committed = false;
    const isDone = () => ev.closed || !!ev.error || ev.completed != null;
    start = performance.now();
    await pace(samples, rate, (s) => ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: toPcm16(resample(s, rate, OUT_RATE, 16)).toString('base64') })),
      { start, isDone, timeoutAfterClipMs: 10000, onClipEnd: () => { committed = true; ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' })); } });
    if (!committed) throw new Error(ev.error ?? 'not committed');
  } finally {
    ws.close();
  }
  if (ev.completed == null) throw new Error(ev.error ?? 'no completed transcript');
  const endMs = clip.speechEndMs;
  return {
    transcript: ev.completed.trim(),
    latencyMs: Math.round(ev.completedAt - endMs),
    extra: { lastDeltaMs: ev.lastDeltaAt != null ? Math.round(ev.lastDeltaAt - endMs) : null, commitAfterSpeechEndMs: Math.round(clip.durationS * 1000 - endMs) },
  };
}

// ---------- Microsoft MAI-Transcribe-2 (offline comparison, not used in the product; adapter only) ----------
async function maiTranscribe(clip, { hints }) {
  const wav = readFileSync(join(ROOT, clip.file));
  const fd = new FormData();
  fd.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  const definition = { enhancedMode: { enabled: true, model: 'MAI-Transcribe-2' }, locales: [clip.lang] };
  if (hints) definition.phraseList = { phrases: menuHints(clip.lang) };
  fd.append('definition', JSON.stringify(definition));
  const base = process.env.MS_SPEECH_ENDPOINT.replace(/\/+$/, '');
  const t0 = performance.now();
  const r = await fetch(`${base}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': process.env.MS_SPEECH_KEY }, body: fd });
  const latencyMs = Math.round(performance.now() - t0);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.code ?? ''} ${String(j.error?.message ?? '').slice(0, 160)}`);
  const transcript = (j.combinedPhrases ?? []).map((p) => p.text).join(' ').trim();
  return { transcript, latencyMs, extra: {} };
}

/** Azure Voice Live (WebSocket) used only for its input transcription: input_audio_transcription.model = mai-transcribe-2,
 *  server VAD with create_response false, so the session model (gpt-4.1-mini; gpt-realtime is not offered in this
 *  East US resource) never answers. The transcript arrives per committed turn (no partial deltas seen). */
async function azureVoiceLive(clip, { sessionModel }) {
  const { rate, samples } = readWav(readFileSync(join(ROOT, clip.file)));
  const OUT_RATE = 24000;
  const host = process.env.MS_SPEECH_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const ws = new WebSocket(`wss://${host}/voice-live/realtime?api-version=2026-04-10&model=${encodeURIComponent(sessionModel)}`, { headers: { 'api-key': process.env.MS_SPEECH_KEY } });
  const ev = { ready: false, order: [], text: new Map(), committed: 0, completed: 0, lastAt: null, stoppedAt: null, error: null, closed: false };
  let start = null;
  const now = () => (start == null ? 0 : performance.now() - start);
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'session.updated') ev.ready = true;
    else if (m.type === 'input_audio_buffer.committed') { ev.committed++; ev.order.push(m.item_id); }
    else if (m.type === 'input_audio_buffer.speech_stopped' && ev.stoppedAt == null) ev.stoppedAt = now();
    else if (m.type === 'conversation.item.input_audio_transcription.completed') { ev.completed++; ev.text.set(m.item_id, m.transcript ?? ''); ev.lastAt = now(); }
    else if (m.type === 'conversation.item.input_audio_transcription.failed') { ev.completed++; ev.error ??= `transcription failed ${JSON.stringify(m.error ?? {}).slice(0, 160)}`; }
    else if (m.type === 'error') ev.error ??= `${m.error?.code ?? ''} ${String(m.error?.message ?? '').slice(0, 200)}`;
  });
  ws.on('error', (e) => { ev.error ??= e.message; });
  ws.on('close', () => { ev.closed = true; });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  try {
    ws.send(JSON.stringify({ type: 'session.update', session: { modalities: ['text'], instructions: LIVE_SYSTEM, input_audio_format: 'pcm16',
      input_audio_transcription: { model: 'mai-transcribe-2', language: clip.lang }, turn_detection: { type: 'server_vad', create_response: false } } }));
    const t0 = performance.now();
    while (!ev.ready && !ev.error && performance.now() - t0 < 10000) await sleep(20);
    if (!ev.ready) throw new Error(ev.error ?? 'no session.updated');
    let clipEndAt = Infinity;
    const isDone = () => {
      if (ev.closed || ev.error) return true;
      const t = now();
      return t >= clipEndAt && ev.committed > 0 && ev.completed >= ev.committed && ev.lastAt >= clip.speechEndMs - 200 && t - ev.lastAt >= 700;
    };
    start = performance.now();
    await pace(samples, rate, (s) => ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: toPcm16(resample(s, rate, OUT_RATE, 16)).toString('base64') })),
      { start, isDone, timeoutAfterClipMs: 45000, onClipEnd: () => { clipEndAt = now(); } });
  } finally {
    ws.close();
  }
  const transcript = ev.order.map((id) => ev.text.get(id) ?? '').join(' ').trim();
  if (!transcript && ev.error) throw new Error(ev.error);
  const endMs = clip.speechEndMs;
  return {
    transcript,
    latencyMs: ev.lastAt != null ? Math.round(ev.lastAt - endMs) : null,
    extra: { pieces: ev.completed, vadEndMs: ev.stoppedAt != null ? Math.round(ev.stoppedAt - endMs) : null, timedOut: !transcript, error: ev.error ?? undefined },
  };
}

// ---------- registry ----------
const geminiKey = () => (process.env.GEMINI_API_KEY ? null : 'GEMINI_API_KEY missing');
const openaiKey = () => (process.env.OPENAI_API_KEY ? null : 'OPENAI_API_KEY missing');
const msKey = () => (process.env.MS_SPEECH_KEY && process.env.MS_SPEECH_ENDPOINT ? null : 'not run: Azure subscription disabled (MS_SPEECH_KEY / MS_SPEECH_ENDPOINT not set)');
const gcloud = () => { try { gcloudToken(); return null; } catch { return 'gcloud auth print-access-token failed'; } };

export const SYSTEMS = {
  'gemini-live': {
    label: 'Gemini Live gemini-3.8-live, minimal instruction, inputAudioTranscription {} (the product\'s transcription setting)', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.8-live', config: { responseModalities: [Modality.AUDIO], systemInstruction: LIVE_SYSTEM, inputAudioTranscription: {} } }),
  },
  'gemini-live-lang': {
    label: 'Gemini Live gemini-3.8-live + inputAudioTranscription.languageCodes only', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.8-live', config: { responseModalities: [Modality.AUDIO], systemInstruction: LIVE_SYSTEM,
      inputAudioTranscription: { languageCodes: [c.lang === 'ko' ? 'ko-KR' : 'en-US'] } } }),
  },
  'gemini-live-vocab': {
    label: 'Gemini Live gemini-3.8-live + languageCodes + customVocabulary (menu names)', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.8-live', config: { responseModalities: [Modality.AUDIO], systemInstruction: LIVE_SYSTEM,
      inputAudioTranscription: { languageCodes: [c.lang === 'ko' ? 'ko-KR' : 'en-US'], customVocabulary: menuHints(c.lang) } } }),
  },
  'gemini-live-menu': {
    label: 'Gemini Live gemini-3.8-live + menu names in system instruction (closest to the product, whose instructions carry the full menu data)', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.8-live', config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {},
      systemInstruction: `${LIVE_SYSTEM} Menu and order words customers may say: ${menuHints(c.lang).join(', ')}.` } }),
  },
  'gemini-transcribe-live': {
    label: 'Gemini realtime transcription gemini-3.5-transcribe-live', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.5-transcribe-live', config: { responseModalities: [Modality.TEXT], inputAudioTranscription: {} } }),
  },
  'gemini-transcribe-live-lang': {
    label: 'Gemini gemini-3.5-transcribe-live + languageCodes only', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.5-transcribe-live', config: { responseModalities: [Modality.TEXT],
      inputAudioTranscription: { languageCodes: [c.lang === 'ko' ? 'ko-KR' : 'en-US'] } } }),
  },
  'gemini-transcribe-live-vocab': {
    label: 'Gemini gemini-3.5-transcribe-live + languageCodes + customVocabulary (menu names)', google: true, kind: 'stream', blocked: geminiKey,
    run: (c) => geminiLive(c, { model: 'gemini-3.5-transcribe-live', config: { responseModalities: [Modality.TEXT],
      inputAudioTranscription: { languageCodes: [c.lang === 'ko' ? 'ko-KR' : 'en-US'], customVocabulary: menuHints(c.lang) } } }),
  },
  'gemini-flash-batch': {
    label: 'Gemini 3.8 Flash batch generateContent (gemini-3.8-flash)', google: true, kind: 'batch', blocked: geminiKey,
    run: (c) => geminiBatch(c, { model: 'gemini-3.8-flash' }),
  },
  'chirp3': {
    label: 'Cloud Speech-to-Text v2 Chirp 3 (chirp_3, location us)', google: true, kind: 'batch', blocked: gcloud,
    run: (c) => chirp3(c, { hints: false }),
  },
  'chirp3-hints': {
    label: 'Cloud Speech-to-Text v2 Chirp 3 + inline phrase set (menu names, boost 10)', google: true, kind: 'batch', blocked: gcloud,
    run: (c) => chirp3(c, { hints: true }),
  },
  'openai-batch': {
    label: 'OpenAI gpt-transcribe batch (offline comparison, not used in the product)', google: false, kind: 'batch', blocked: openaiKey,
    run: (c) => openaiBatch(c, { model: 'gpt-transcribe' }),
  },
  'openai-realtime': {
    label: 'OpenAI gpt-live-transcribe realtime (offline comparison, not used in the product)', google: false, kind: 'stream', blocked: openaiKey,
    run: (c) => openaiRealtime(c, { model: 'gpt-live-transcribe' }),
  },
  'mai-transcribe-2': {
    label: 'Microsoft MAI-Transcribe-2 fast transcription REST (offline comparison, not used in the product)', google: false, kind: 'batch', blocked: msKey,
    run: (c) => maiTranscribe(c, { hints: false }),
  },
  'mai-transcribe-2-hints': {
    label: 'Microsoft MAI-Transcribe-2 + phraseList (menu names) (offline comparison, not used in the product)', google: false, kind: 'batch', blocked: msKey,
    run: (c) => maiTranscribe(c, { hints: true }),
  },
  'mai-voicelive': {
    label: 'Microsoft MAI-Transcribe-2 via Azure Voice Live streaming (offline comparison, not used in the product)', google: false, kind: 'stream', blocked: msKey,
    run: (c) => azureVoiceLive(c, { sessionModel: 'gpt-4.1-mini' }),
  },
};
