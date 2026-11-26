// F2 (l3-flow-text) on the word layer: the judge's batch transcript of each mix (its `open` word log, made from
// bench/inputs only) goes through the flow filter; the kept words are the candidate's text_turns.
// LABEL: a batch transcript of the whole mix. On the phone, Live's own input transcription does not arrive while
// bystanders keep talking (logs/live-open.jsonl: chat@0 and order@0, 0 of 6 runs with any transcript, en and ko), so
// this score is for a design that needs L1 to end the turn or a second streaming transcriber.
// The dialogue state is fixed for every word trial (the candidate cannot read refs): empty cart, no earlier words,
// KIBO's opening question. Short answers ("Yes.", "That's all.") therefore arrive out of context.
//
//   npx tsx --env-file=.env spikes/speaker-gate/candidates/l3-flow-text/run.ts --open-log <words-open log> --cap-won N
//     [--name l3-flow-text] [--model gemini-3.8-flash] [--thinking low] [--limit N]
//     [--only-cells short,short+chat@0] [--asked]
// --asked: the state after the order is in: the hero order in the cart, the customer's hero sentence as their earlier
//   words, and KIBO asking whether that is everything (the question a short "Yes." or "That's all." answers). The
//   cells are picked by the judge's own word log (a bench-side selection, not something the filter sees).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { sha256 } from "../../bench/audio";
import { isQuotaError, ledger } from "../../bench/spend";
import { FLOW_INSTRUCTION, FLOW_MODEL, FLOW_SCHEMA, FLOW_VERSION, flowPrompt, parseFlow, type FlowState } from "./flow";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
const NAME = arg("name", "l3-flow-text");
const MODEL = arg("model", FLOW_MODEL);
const THINKING = arg("thinking", "low");
export const ASKED = { en: "Is that everything, or would you like anything else?", ko: "주문 다 하셨어요, 더 필요하신 거 있으세요?" };
const HERO_LINES = { en: ["2 x Cheeseburger set"], ko: ["치즈버거 세트 2개"] };
const HERO_WORDS = { en: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider.", ko: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고, 음료는 제로콜라랑 사이다로요." };
export const OPENING = { en: "Hello! What would you like to order?", ko: "안녕하세요! 무엇을 주문하시겠어요?" };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

export function menuNames(lang: "en" | "ko"): string[] {
  const k = JSON.parse(readFileSync(join(process.cwd(), "data/kiosks/malo.json"), "utf8")) as { items: { name: Record<string, string> }[] };
  return k.items.map((i) => i.name[lang]);
}

export async function flowCall(ai: GoogleGenAI, state: FlowState, transcript: string) {
  const t0 = performance.now();
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: flowPrompt(state, transcript) }] }],
      config: { systemInstruction: FLOW_INSTRUCTION, temperature: 0, thinkingConfig: { thinkingLevel: THINKING as never }, responseMimeType: "application/json", responseSchema: FLOW_SCHEMA },
    });
    const ms = Math.round(performance.now() - t0);
    appendFileSync(join(BENCH, "logs", "calls.jsonl"), JSON.stringify({ at: new Date().toISOString(), kind: "flow", model: MODEL, thinking: THINKING, version: FLOW_VERSION, ms, usage: res.usageMetadata ?? null }) + "\n");
    return { ...parseFlow(res.text ?? ""), ms };
  } catch (e) {
    if (isQuotaError(e)) {
      console.error(`API refused for quota or credit: ${e instanceof Error ? e.message.slice(0, 200) : ""}; stopped`);
      process.exit(3);
    }
    throw e;
  }
}

async function main() {
  const cap = Number(arg("cap-won", "NaN"));
  if (!Number.isFinite(cap)) throw new Error("--cap-won <won> is required");
  if (ledger().totalWon >= cap) throw new Error(`ledger at or over the cap ₩${cap}`);
  const openLog = JSON.parse(readFileSync(arg("open-log", ""), "utf8")) as { candidate: string; rows: { trial: string; lang: "en" | "ko"; cell: string; transcript: string }[] };
  if (openLog.candidate !== "open") throw new Error("--open-log must be a words-open log");
  const manifestRaw = readFileSync(join(BENCH, "manifest.json"));
  const lengths = new Map((JSON.parse(manifestRaw.toString()).trials as { id: string; lengthMs: number }[]).map((t) => [t.id, t.lengthMs]));
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const outDir = join(BENCH, "out", NAME);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "MANIFEST"), sha256(manifestRaw) + "\n");
  const menus = { en: menuNames("en"), ko: menuNames("ko") };
  const only = arg("only-cells", "") ? new Set(arg("only-cells", "").split(",")) : null;
  const asked = process.argv.includes("--asked");
  const rows = openLog.rows.filter((r) => !only || only.has(r.cell)).slice(0, Number(arg("limit", "100000")));
  writeFileSync(join(outDir, "TRIALS"), rows.map((r) => r.trial).join("\n") + "\n");
  let next = 0;
  const ms: number[] = [];
  await Promise.all(
    Array.from({ length: Number(arg("conc", "8")) }, async () => {
      while (next < rows.length) {
        const r = rows[next++];
        const state: FlowState = asked
          ? { lang: r.lang, menu: menus[r.lang], cart: HERO_LINES[r.lang], lastQuestion: ASKED[r.lang], earlier: [HERO_WORDS[r.lang]] }
          : { lang: r.lang, menu: menus[r.lang], cart: [], lastQuestion: OPENING[r.lang], earlier: [] };
        const f = r.transcript.trim() ? await flowCall(ai, state, r.transcript) : { text: "", complete: false, unsure: false, ms: 0 };
        if (f.ms) ms.push(f.ms);
        const meta = { latency_ms: f.ms, text_turns: f.text.trim() ? [{ at_ms: lengths.get(r.trial)!, text: f.text }] : [], flow: { model: MODEL, thinking: THINKING, asked, version: FLOW_VERSION, complete: f.complete, unsure: f.unsure, ms: f.ms, source: "words-open transcript" } };
        mkdirSync(join(outDir, r.trial), { recursive: true });
        writeFileSync(join(outDir, r.trial, "meta.json"), JSON.stringify(meta) + "\n");
      }
    }),
  );
  ms.sort((a, b) => a - b);
  console.log(`out/${NAME}: ${rows.length} trials, ${ms.length} flow calls; latency median ${ms[Math.floor(ms.length / 2)]} ms, p10 ${ms[Math.floor(ms.length * 0.1)]}, p90 ${ms[Math.floor(ms.length * 0.9)]}, min ${ms[0]}, max ${ms[ms.length - 1]}`);
}

if (process.argv[1]?.endsWith("run.ts")) main();
