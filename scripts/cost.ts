// USD cost of one hero order from the token counts in evidence/cost-per-order.json (`npm run measure:cost`) and the
// official Gemini API prices stored next to them. Tokens × price only; no exchange rate.

/** USD per 1M tokens. */
export interface Prices {
  flashInput: number;
  flashCachedInput: number;
  /** Output, thinking included. */
  flashOutput: number;
  liveTextInput: number;
  liveAudioInput: number;
  liveTextOutput: number;
  liveAudioOutput: number;
}

interface TextOrder {
  prompt: number;
  cached: number;
  candidates: number;
  thoughts: number;
}

interface LiveMessage {
  prompt: number;
  candidates: number;
  thoughts: number;
  promptByModality?: { TEXT?: number; AUDIO?: number };
  responseByModality?: { TEXT?: number; AUDIO?: number };
}

const M = 1_000_000;

export function textOrderUsd(o: TextOrder, p: Prices): number {
  return ((o.prompt - o.cached) * p.flashInput + o.cached * p.flashCachedInput + (o.candidates + o.thoughts) * p.flashOutput) / M;
}

/**
 * One Live usage message. `promptByModality` (TEXT + AUDIO) adds up to less than `prompt`; `unattributed` says how
 * the rest is billed. Output that is not audio (tool calls) and thoughts are billed at the text output rate.
 */
export function liveMessageUsd(m: LiveMessage, p: Prices, unattributed: "text" | "audio"): number {
  const audioIn = m.promptByModality?.AUDIO ?? 0;
  const rest = m.prompt - audioIn - (m.promptByModality?.TEXT ?? 0);
  const textIn = m.prompt - audioIn - (unattributed === "audio" ? rest : 0);
  const audioInBilled = audioIn + (unattributed === "audio" ? rest : 0);
  const audioOut = m.responseByModality?.AUDIO ?? 0;
  const textOut = m.candidates - audioOut + m.thoughts;
  return (textIn * p.liveTextInput + audioInBilled * p.liveAudioInput + audioOut * p.liveAudioOutput + textOut * p.liveTextOutput) / M;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Rounded to a millionth of a dollar, so the stored values compare exactly. */
const usd = (x: number) => Math.round(x * M) / M;

interface Evidence {
  prices: Prices;
  text: { runs: { order: TextOrder }[] };
  voice: { runs: { usageMessages: LiveMessage[] }[] };
}

/** Cost per run of each completed order, and the median over runs (not the cost of the median tokens). */
export function costPerOrder(e: Evidence) {
  const textRuns = e.text.runs.map((r) => usd(textOrderUsd(r.order, e.prices)));
  const voiceOf = (how: "text" | "audio") =>
    e.voice.runs.map((r) => usd(r.usageMessages.reduce((sum, m) => sum + liveMessageUsd(m, e.prices, how), 0)));
  const voiceRuns = voiceOf("text");
  return {
    text: { runs: textRuns, median: usd(median(textRuns)) },
    voice: { runs: voiceRuns, median: usd(median(voiceRuns)), medianIfUnattributedIsAudio: usd(median(voiceOf("audio"))) },
  };
}
