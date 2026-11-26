// The run's spend ledger (kibo-59, 11-26): every Gemini call the speaker-gate experiment made, from the logs.
//   Live sessions:   logs/live-*.jsonl and logs/v1/live-*.jsonl, their usage messages.
//   Text calls:      logs/calls.jsonl (one row per call with usage, from 11-27 on; transcriber and F2).
//   Earlier calls:   transcriber calls before calls.jsonl existed, counted from the transcript caches and priced at
//                    an estimate (no usage was recorded); TTS clips counted from bench/audio/src/tts.
//   Other streams:   logs/spend-other.json, filled by the orchestrator ({ "<stream>": { sessions, usd, note } }).
// Prices: Gemini API paid tier read 2026-10-13 (evidence/cost-per-order.json); whether they still hold is
// unverified, and Flash audio input is assumed at the Live audio rate (an upper bound).
//   npx tsx spikes/speaker-gate/bench/spend.ts        prints totals, writes logs/spend.json

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
export const PRICES = { liveText: 0.75, liveAudioIn: 3, liveAudioOut: 12, liveTextOut: 4.5, flashIn: 0.75, flashAudioIn: 3, flashOut: 3.75, wonPerUsd: 1400 };

type Detail = { modality?: string; tokenCount?: number }[];
interface LiveUsage {
  promptTokenCount?: number;
  responseTokenCount?: number;
  promptTokensDetails?: Detail;
  responseTokensDetails?: Detail;
  thoughtsTokenCount?: number;
}

const of = (d: Detail | undefined, m: string) => (d ?? []).filter((x) => x.modality === m).reduce((n, x) => n + (x.tokenCount ?? 0), 0);

/** One Live session's USD from its usage messages (each one bills its whole prompt). */
export function liveUsd(usage: LiveUsage[]): number {
  let usd = 0;
  for (const u of usage) {
    const audioIn = of(u.promptTokensDetails, "AUDIO");
    const textIn = (u.promptTokenCount ?? 0) - audioIn;
    const audioOut = of(u.responseTokensDetails, "AUDIO");
    const textOut = (u.responseTokenCount ?? 0) - audioOut + (u.thoughtsTokenCount ?? 0);
    usd += textIn * PRICES.liveText + audioIn * PRICES.liveAudioIn + audioOut * PRICES.liveAudioOut + textOut * PRICES.liveTextOut;
  }
  return usd / 1e6;
}

/** One generateContent call's USD from its usageMetadata. */
export function textUsd(u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; promptTokensDetails?: Detail }): number {
  const audioIn = of(u.promptTokensDetails, "AUDIO");
  const textIn = (u.promptTokenCount ?? 0) - audioIn;
  return (textIn * PRICES.flashIn + audioIn * PRICES.flashAudioIn + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * PRICES.flashOut) / 1e6;
}

/** A used-up credit (402) or a reached cap (429): stop at once (docs/plan/OPERATIONS.md "Spend caps"). */
export function isQuotaError(e: unknown): boolean {
  const o = (e ?? {}) as { status?: number; code?: number; message?: string; reason?: string };
  if (o.status === 402 || o.status === 429 || o.code === 402 || o.code === 429) return true;
  const text = `${o.message ?? ""} ${o.reason ?? ""}`;
  return /\b(402|429)\b|RESOURCE_EXHAUSTED|quota|billing|credit|spend cap|spending cap/i.test(text);
}

const jsonl = (f: string) =>
  existsSync(f)
    ? readFileSync(f, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

/** Earlier transcriber calls had no usage logged: about 32 audio tokens a second (unverified) over a 6.5 s trial,
 *  120 prompt tokens and 40 out. */
const EST_TRANSCRIBE_USD = (6.5 * 32 * PRICES.flashAudioIn + 120 * PRICES.flashIn + 40 * PRICES.flashOut) / 1e6;

export function ledger() {
  const logs = join(BENCH, "logs");
  const v1 = join(logs, "v1");
  const liveFiles = [
    ...readdirSync(logs).filter((f) => /^(live|flow)-.*\.jsonl$/.test(f)).map((f) => join(logs, f)),
    ...(existsSync(v1) ? readdirSync(v1).filter((f) => /^live-.*\.jsonl$/.test(f)).map((f) => join(v1, f)) : []),
  ];
  let sessions = 0;
  let withUsage = 0;
  let liveUsdSum = 0;
  let promptTokens = 0;
  let outTokens = 0;
  // Sessions without usage (errors, turns that never ended, early v1 runs) are priced at the mean of the sessions with
  // usage in the same log file, so a costly kind of session does not re-price a cheap one.
  let liveEstUsd = 0;
  for (const f of liveFiles) {
    let n = 0;
    let withU = 0;
    let usd = 0;
    for (const r of jsonl(f)) {
      sessions++;
      n++;
      if (!Array.isArray(r.usage) || !r.usage.length) continue;
      withU++;
      withUsage++;
      const u1 = liveUsd(r.usage);
      usd += u1;
      liveUsdSum += u1;
      for (const u of r.usage) {
        promptTokens += u.promptTokenCount ?? 0;
        outTokens += (u.responseTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      }
    }
    liveEstUsd += withU ? (usd / withU) * n : 0;
  }
  const calls = jsonl(join(logs, "calls.jsonl"));
  const byKind: Record<string, { calls: number; usd: number; promptTokens: number; outTokens: number }> = {};
  for (const c of calls) {
    const k = (byKind[c.kind] ??= { calls: 0, usd: 0, promptTokens: 0, outTokens: 0 });
    k.calls++;
    k.usd += c.usage ? textUsd(c.usage) : 0;
    k.promptTokens += c.usage?.promptTokenCount ?? 0;
    k.outTokens += (c.usage?.candidatesTokenCount ?? 0) + (c.usage?.thoughtsTokenCount ?? 0);
  }
  const loggedTranscribes = byKind.transcribe?.calls ?? 0;
  const cacheKeys = new Set<string>();
  for (const f of [join(BENCH, "work", "transcripts.json"), join(v1, "transcripts.json")]) if (existsSync(f)) for (const k of Object.keys(JSON.parse(readFileSync(f, "utf8")))) cacheKeys.add(k);
  const earlierTranscribes = Math.max(0, cacheKeys.size - loggedTranscribes);
  const ttsDir = join(BENCH, "audio", "src", "tts");
  const ttsClips = existsSync(ttsDir) ? readdirSync(ttsDir).filter((f) => f.endsWith(".wav")).length : 0;
  const otherFile = join(logs, "spend-other.json");
  const other = existsSync(otherFile) ? (JSON.parse(readFileSync(otherFile, "utf8")) as Record<string, { sessions?: number; usd?: number; note?: string }>) : {};
  const otherUsd = Object.values(other).reduce((n, o) => n + (o.usd ?? 0), 0);
  const textUsdSum = Object.values(byKind).reduce((n, k) => n + k.usd, 0);
  const earlierUsd = earlierTranscribes * EST_TRANSCRIBE_USD;
  // TTS: about 5 s of audio out per clip at 25 tokens a second and the audio-out rate; regenerations not counted.
  const ttsUsd = (ttsClips * 5 * 25 * PRICES.liveAudioOut) / 1e6;
  const totalUsd = liveEstUsd + textUsdSum + earlierUsd + ttsUsd + otherUsd;
  return {
    at: new Date().toISOString(),
    prices: { ...PRICES, source: "evidence/cost-per-order.json (read 2026-10-13); unverified today; Flash audio in assumed = Live audio in" },
    live: { sessions, withUsage, promptTokens, outTokens, usdMeasured: liveUsdSum, usdIncludingSessionsWithoutUsage: liveEstUsd },
    textCalls: byKind,
    earlierTranscriberCalls: { calls: earlierTranscribes, usdEstimate: earlierUsd, note: "no usage logged; estimated per call" },
    tts: { clips: ttsClips, usdEstimate: ttsUsd, note: "estimated; regenerated clips not counted" },
    otherStreams: other,
    totalUsd,
    totalWon: Math.round(totalUsd * PRICES.wonPerUsd),
  };
}

if (process.argv[1]?.endsWith("spend.ts")) {
  const l = ledger();
  writeFileSync(join(BENCH, "logs", "spend.json"), JSON.stringify(l, null, 1) + "\n");
  console.log(`Live sessions ${l.live.sessions} (${l.live.withUsage} with usage): ${l.live.promptTokens} prompt + ${l.live.outTokens} out tokens, $${l.live.usdIncludingSessionsWithoutUsage.toFixed(2)}`);
  for (const [k, v] of Object.entries(l.textCalls)) console.log(`text calls ${k}: ${v.calls}, ${v.promptTokens} prompt + ${v.outTokens} out tokens, $${v.usd.toFixed(2)}`);
  console.log(`earlier transcriber calls (estimated): ${l.earlierTranscriberCalls.calls}, $${l.earlierTranscriberCalls.usdEstimate.toFixed(2)}`);
  console.log(`TTS clips (estimated): ${l.tts.clips}, $${l.tts.usdEstimate.toFixed(2)}`);
  console.log(`other streams: ${Object.keys(l.otherStreams).length ? JSON.stringify(l.otherStreams) : "none reported yet (logs/spend-other.json)"}`);
  console.log(`TOTAL about $${l.totalUsd.toFixed(2)} = about ₩${l.totalWon} (prices and ₩${PRICES.wonPerUsd}/$ unverified); logs/spend.json`);
}
