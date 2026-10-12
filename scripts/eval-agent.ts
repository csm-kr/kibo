// Agent evaluation (docs/TESTING.md "Agent evaluation set"): runs evals/agent-cases.json against real Gemini
// through runChat, exactly as POST /api/chat does, and saves the result as evidence in evals/results/.
// Results hold ids, codes and timings only: no reply text, no utterances, no key.
// Run with `npm run eval:agent` (reads GEMINI_API_KEY from .env).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runChat } from "@/lib/agent/chat";
import { geminiClient, type ModelClient } from "@/lib/agent/model";
import { CommandError } from "@/lib/commands/errors";
import { MemoryUsageStore } from "@/lib/limits/usage";
import { chatReducer, historyFor, initialChat } from "@/lib/phone/chat";
import { createSession } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import type { Locale } from "@/types/menu";
import type { CartLine, Session, SessionStatus } from "@/types/session";

interface ExpectedLine {
  itemId: string;
  variant: string;
  qty: number;
  selections: Record<string, string[]>;
}

type Expect =
  | { cart: ExpectedLine[] }
  | { choices: { templateId: string; ids: string[] } }
  | { staff: true }
  | { refuse: true }
  | { status: SessionStatus };

interface Case {
  id: string;
  type: string;
  locale: Locale;
  turns: string[];
  expect: Expect;
}

interface ToolCall {
  name: string;
  /** "ok", an error code, or "unsent" when the loop ended before the result went back to the model. */
  code: string;
}

interface RequestLog {
  ms: number;
  /** Until the first command was committed; null when no command was accepted. */
  firstToolMs: number | null;
  tools: ToolCall[];
  error?: string;
}

// npm runs scripts from the repo root.
const ROOT = process.cwd();
// 14:00 KST: lunch items are on sale and breakfast (05:00-10:30) is not.
const EVAL_CLOCK = Date.parse("2026-10-13T05:00:00Z");
const PAUSE_MS = 1500;
const RETRY_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Records each tool call and the result code the model received for it. */
function recording(inner: ModelClient, calls: ToolCall[]): ModelClient {
  return {
    async generate(req) {
      // The previous round's results are the last user turn, in call order.
      const results = (req.contents.at(-1)?.parts ?? []).flatMap((p) => {
        const r = (p as { functionResponse?: { response?: { ok?: boolean; code?: string } } }).functionResponse?.response;
        return r ? [r.ok ? "ok" : (r.code ?? "error")] : [];
      });
      const waiting = calls.filter((c) => c.code === "unsent");
      results.forEach((code, i) => {
        if (waiting[i]) waiting[i].code = code;
      });
      const out = await inner.generate(req);
      for (const c of out.functionCalls) calls.push({ name: c.name, code: "unsent" });
      return out;
    },
  };
}

function key(l: { itemId: string; variant: string; selections: Record<string, string[]> }): string {
  const sel = Object.entries(l.selections)
    .filter(([, ids]) => ids.length > 0)
    .map(([g, ids]) => [g, [...ids].sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([l.itemId, l.variant, sel]);
}

/** Order-insensitive; identical lines are merged, so two lines of 1 equal one line of 2. */
function normalize(lines: (ExpectedLine | CartLine)[]): string {
  const qty = new Map<string, number>();
  for (const l of lines) qty.set(key(l), (qty.get(key(l)) ?? 0) + l.qty);
  return JSON.stringify([...qty.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function cartIds(cart: CartLine[]) {
  return cart.map(({ itemId, variant, qty, selections }) => ({ itemId, variant, qty, selections }));
}

function judge(c: Case, final: Session, before: CartLine[], calls: ToolCall[]): string | null {
  const unchanged = normalize(final.cart) === normalize(before);
  const e = c.expect;
  if ("cart" in e) return normalize(final.cart) === normalize(e.cart) ? null : "final cart differs";
  if ("status" in e) return final.status === e.status ? null : `status ${final.status}`;
  if (!unchanged) return "cart changed";
  if ("choices" in e) {
    const p = final.pendingChoice;
    if (!p) return "no choice buttons";
    if (p.templateId !== e.choices.templateId) return `choice template ${p.templateId}`;
    const missing = e.choices.ids.filter((id) => !p.choices.some((ch) => ch.id === id));
    return missing.length === 0 ? null : `choices miss ${missing.join(",")}`;
  }
  if ("staff" in e) return final.staffCalled?.reasonCode === "unknown_info" ? null : "staff not called";
  return calls.some((t) => t.code === "BAD_REQUEST") ? "a tool call failed with BAD_REQUEST" : null;
}

async function runCase(c: Case, model: ModelClient) {
  const store = new MemoryStore();
  const usage = new MemoryUsageStore();
  const started = Date.now();
  const now = () => EVAL_CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: "malo", demo: true }, now());

  let chat = initialChat;
  let before: CartLine[] = [];
  const allCalls: ToolCall[] = [];
  const requests: RequestLog[] = [];

  for (const message of c.turns) {
    const session = (await store.get(sessionId))!;
    before = session.cart;
    const history = historyFor(chat.messages);
    chat = chatReducer(chat, { type: "send", text: message });
    // Like AssistantPanel: the phone sends the confirm card's cartVersion only while the card shows.
    const input = {
      sessionId,
      chatRequestId: randomUUID(),
      message,
      history,
      utteranceSeq: chat.utteranceSeq,
      cartVersion: session.status === "confirming" ? session.cartVersion : undefined,
      locale: c.locale,
      bearer: deviceToken!,
    };

    const calls: ToolCall[] = [];
    const known = session.recentCommandIds.length;
    let firstAt: number | null = null;
    const t0 = Date.now();
    const stop = store.subscribe(sessionId, (s) => {
      if (firstAt === null && s && s.recentCommandIds.length > known) firstAt = Date.now();
    });
    const log: RequestLog = { ms: 0, firstToolMs: null, tools: calls };
    try {
      const deps = { store, model: recording(model, calls), usage, now };
      let reply: string;
      try {
        reply = (await runChat(deps, input)).reply;
      } catch (e) {
        if (!(e instanceof CommandError && e.code === "RATE_LIMITED")) throw e;
        // Same chatRequestId: commands already applied come back as duplicates instead of applying twice.
        await sleep(RETRY_WAIT_MS);
        reply = (await runChat(deps, input)).reply;
      }
      chat = chatReducer(chat, { type: "reply", text: reply });
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      log.error = e.code;
      chat = chatReducer(chat, { type: "notice", text: e.code });
    } finally {
      stop();
    }
    log.ms = Date.now() - t0;
    log.firstToolMs = firstAt === null ? null : firstAt - t0;
    requests.push(log);
    allCalls.push(...calls);
    await sleep(PAUSE_MS);
  }

  const final = (await store.get(sessionId))!;
  const failure = requests.find((r) => r.error) ? `request error ${requests.find((r) => r.error)!.error}` : judge(c, final, before, allCalls);
  return {
    id: c.id,
    type: c.type,
    locale: c.locale,
    pass: failure === null,
    ...(failure ? { reason: failure } : {}),
    status: final.status,
    cart: cartIds(final.cart),
    pendingChoice: final.pendingChoice,
    staffCalled: final.staffCalled ? final.staffCalled.reasonCode : null,
    requests,
  };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function kstStamp(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 16).replace(":", "-");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set (.env).");
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(join(ROOT, "evals/agent-cases.json"), "utf8")) as {
    cases: Case[];
    notCovered: { type: string; reason: string }[];
  };
  const only = process.argv.slice(2);
  const cases = only.length > 0 ? file.cases.filter((c) => only.includes(c.id)) : file.cases;
  const modelId = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";
  const thinking = process.env.GEMINI_TEXT_THINKING ?? "low";
  const model = geminiClient();
  const startedAt = Date.now();

  const results = [];
  for (const c of cases) {
    const r = await runCase(c, model);
    console.log(`${r.pass ? "PASS" : "FAIL"} ${c.id}${r.reason ? ` (${r.reason})` : ""}`);
    results.push(r);
  }

  const passed = results.filter((r) => r.pass).length;
  const byType = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const t = byType.get(r.type) ?? { pass: 0, total: 0 };
    t.total++;
    if (r.pass) t.pass++;
    byType.set(r.type, t);
  }
  const reqs = results.flatMap((r) => r.requests).filter((q) => !q.error);
  const totals = reqs.map((q) => q.ms);
  const firsts = reqs.flatMap((q) => (q.firstToolMs === null ? [] : [q.firstToolMs]));
  const latency = {
    requests: reqs.length,
    totalMedianMs: percentile(totals, 50),
    totalP90Ms: percentile(totals, 90),
    firstToolRequests: firsts.length,
    firstToolMedianMs: percentile(firsts, 50),
    firstToolP90Ms: percentile(firsts, 90),
  };
  const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

  const dir = join(ROOT, "evals/results");
  mkdirSync(dir, { recursive: true });
  // Two runs started in the same minute must not overwrite each other's evidence.
  let stamp = kstStamp(startedAt);
  for (let n = 2; existsSync(join(dir, `${stamp}.json`)); n++) stamp = `${kstStamp(startedAt)}-${n}`;
  const summary = {
    date: new Date(startedAt).toISOString(),
    model: modelId,
    thinkingLevel: thinking,
    evalClock: "14:00 KST",
    // Case ids given on the command line: a partial run, not a pass rate for the whole set.
    subset: only.length > 0 ? only : null,
    cases: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    byType: Object.fromEntries(byType),
    latency,
    notCovered: file.notCovered,
  };
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify({ ...summary, results }, null, 2) + "\n");

  const md = [
    `# Agent evaluation ${stamp} (KST)`,
    "",
    ...(only.length > 0 ? [`**Partial run** of ${only.length} case(s), not the whole set.`, ""] : []),
    `- Model: \`${modelId}\`, thinking level \`${thinking}\`, default temperature`,
    `- Date: ${summary.date}; eval clock 14:00 KST; cases from \`evals/agent-cases.json\` (written by the KIBO team, not an external benchmark)`,
    `- Overall: **${passed}/${results.length} (${pct(passed, results.length || 1)})**`,
    `- Latency per request (${latency.requests} requests): median ${latency.totalMedianMs} ms, p90 ${latency.totalP90Ms} ms`,
    `- Until the first command is applied (${latency.firstToolRequests} requests): median ${latency.firstToolMedianMs} ms, p90 ${latency.firstToolP90Ms} ms`,
    "",
    "| Type | Pass |",
    "|---|---|",
    ...[...byType].map(([t, v]) => `| ${t} | ${v.pass}/${v.total} |`),
    ...file.notCovered.map((n) => `| ${n.type} | not covered yet: ${n.reason} |`),
    "",
    "## Failed cases",
    ...(results.some((r) => !r.pass) ? results.filter((r) => !r.pass).map((r) => `- \`${r.id}\`: ${r.reason}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(dir, `${stamp}.md`), md);
  console.log(`\n${passed}/${results.length} passed. Wrote evals/results/${stamp}.json and .md`);
}

main().catch((e) => {
  console.error("eval crashed:", e);
  process.exit(1);
});
