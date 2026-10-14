// Agent evaluation (docs/TESTING.md "Agent evaluation set"): runs evals/agent-cases.json against real Gemini
// through runChat, exactly as POST /api/chat does, and saves the result as evidence in evals/results/.
// Results hold ids, codes and timings only: no reply text, no utterances, no key. Reply cases keep only the
// grounding verdict and the deny-list words it matched.
// Run with `npm run eval:agent`: the text agent's backend, `auto` by default (the Gemini API key in .env, Vertex AI
// through gcloud application default credentials as the fallback); `GEMINI_TEXT_BACKEND=api|vertex` pins one.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runChat } from "@/lib/agent/chat";
import { geminiClient, textBackendSetting, type ModelClient, type TextBackend } from "@/lib/agent/model";
import { addLine, cartTotal, removeLine } from "@/lib/commands/cart";
import { CommandError } from "@/lib/commands/errors";
import { MemoryUsageStore } from "@/lib/limits/usage";
import { chatReducer, historyFor, initialChat } from "@/lib/phone/chat";
import { createSession, runCommand } from "@/lib/session/service";
import { getKiosk } from "@/lib/adapters/catalog";
import { MemoryStore } from "@/lib/store/memory";
import type { SpeechLanguage } from "@/lib/i18n/languages";
import type { Locale } from "@/types/menu";
import type { CartLine, DineOption, Session, SessionStatus } from "@/types/session";
import { FALLBACK } from "@/lib/agent/chat";
import { checkGrounding, internalWords, offersToPay, replyLanguage, saysCannot, type GroundingResult } from "./grounding";

interface ExpectedLine {
  itemId: string;
  variant: string;
  qty: number;
  selections: Record<string, string[]>;
}

/** `excludes`: ids that must not be among the buttons ("not spicy" must not offer a Spicy item). */
type ChoicesExpect = { templateId: string; ids: string[]; excludes?: string[] };

type Expect =
  // With `choices`: one sentence that adds a line and asks about another ("a coffee for me, something not spicy for him").
  // With `saysCannot` (15-judge-fixes:0): the last reply names one of these words and says it cannot be done.
  | { cart: ExpectedLine[]; choices?: ChoicesExpect; saysCannot?: string[] }
  | { choices: ChoicesExpect }
  // A question back instead of a staff call (14-final:4): cart unchanged, no staff, choice buttons or a question mark,
  // and a grounded reply; `mentionsAny`: the reply or the buttons name one of these items.
  | { ask: { mentionsAny?: string[] } }
  | { staff: true }
  | { refuse: true }
  | { status: SessionStatus }
  // The last reply passes the grounding check (I-072) and names at least one of these items. `payOnKiosk` (learned
  // kiosks, I-100): the order is at the review, nobody tried confirmCheckout and the reply never offers to pay.
  | { reply: { mentionsAny?: string[]; payOnKiosk?: true } };

interface Case {
  id: string;
  /** Kiosk the case runs on; default "malo". */
  kioskId?: string;
  type: string;
  /** Cases added in 14-final:4 are reported apart from the earlier set: "colloquial" or "language". */
  group?: string;
  locale: Locale;
  /** The phone's AI language from the picker, when it is not `locale`. */
  language?: SpeechLanguage;
  /** Every reply must be in this language (replyLanguage, no AI); only the detected codes are kept. */
  replyIn?: string;
  /** A string is a typed message; `tapDine` is a tap on a dine button, after which the phone sends a held order again. */
  turns: (string | { tapDine: DineOption })[];
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
  /** Each model call of the request, in ms (14-final:5): one entry means the reply needed no second round. */
  rounds: number[];
  tools: ToolCall[];
  error?: string;
}

// npm runs scripts from the repo root.
const ROOT = process.cwd();
// 14:00 KST: lunch items are on sale and breakfast (05:00-10:30) is not.
const EVAL_CLOCK = Date.parse("2026-10-13T05:00:00Z");
const PAUSE_MS = 1500;
const RETRY_WAIT_MS = 30_000;

const BACKEND_NAMES = {
  api: "the Gemini API",
  vertex: "Vertex AI",
  auto: "auto (the Gemini API, Vertex AI on billing, quota or server errors)",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Model calls per backend that answered, so an auto run says how much Vertex served. */
const served: Record<TextBackend, number> = { api: 0, vertex: 0 };

/** Records each tool call, the result code the model received for it, and how long each model call took. */
function recording(inner: ModelClient, calls: ToolCall[], rounds: number[]): ModelClient {
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
      const t0 = Date.now();
      const out = await inner.generate(req);
      rounds.push(Date.now() - t0);
      if (out.backend) served[out.backend]++;
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

function judge(
  c: Case,
  final: Session,
  before: CartLine[],
  calls: ToolCall[],
  grounding: GroundingResult | null,
  payOffer: boolean,
  lastReply: string | null,
): string | null {
  const unchanged = normalize(final.cart) === normalize(before);
  const e = c.expect;
  if ("ask" in e) {
    if (!unchanged) return "cart changed";
    if (final.staffCalled) return "staff called";
    if (!grounding) return "no reply";
    if (!grounding.pass) return `ungrounded: ${grounding.matched.join(",")}`;
    if (!final.pendingChoice && !/[?？]/.test(lastReply ?? "")) return "no question and no choice buttons";
    const ids = e.ask.mentionsAny;
    const named = [...grounding.mentioned, ...(final.pendingChoice?.choices.map((ch) => ch.id) ?? [])];
    return !ids || ids.some((id) => named.includes(id)) ? null : "names none of the expected items";
  }
  if ("reply" in e) {
    if (!unchanged) return "cart changed";
    if (!grounding) return "no reply";
    if (!grounding.pass) return `ungrounded: ${grounding.matched.join(",")}`;
    if (e.reply.payOnKiosk) {
      if (final.status !== "confirming") return `status ${final.status}`;
      if (calls.some((t) => t.name === "confirmCheckout")) return "tried confirmCheckout";
      if (payOffer) return "offered to pay";
    }
    const ids = e.reply.mentionsAny;
    return !ids || ids.some((id) => grounding.mentioned.includes(id)) ? null : "names none of the expected items";
  }
  if ("cart" in e) {
    if (normalize(final.cart) !== normalize(e.cart)) return "final cart differs";
    if (e.saysCannot && !saysCannot(lastReply ?? "", e.saysCannot)) return "unsupported change not said";
    return e.choices ? choiceMiss(final, e.choices) : null;
  }
  if ("status" in e) return final.status === e.status ? null : `status ${final.status}`;
  if (!unchanged) return "cart changed";
  if ("choices" in e) return choiceMiss(final, e.choices);
  if ("staff" in e) return final.staffCalled?.reasonCode === "unknown_info" ? null : "staff not called";
  return calls.some((t) => t.code === "BAD_REQUEST") ? "a tool call failed with BAD_REQUEST" : null;
}

function choiceMiss(final: Session, want: ChoicesExpect): string | null {
  const p = final.pendingChoice;
  if (!p) return "no choice buttons";
  if (p.templateId !== want.templateId) return `choice template ${p.templateId}`;
  const missing = want.ids.filter((id) => !p.choices.some((ch) => ch.id === id));
  if (missing.length > 0) return `choices miss ${missing.join(",")}`;
  const unwanted = (want.excludes ?? []).filter((id) => p.choices.some((ch) => ch.id === id));
  return unwanted.length === 0 ? null : `choices include ${unwanted.join(",")}`;
}

/**
 * Learned kiosks: a stand-in for the in-page bridge that reports every replay as done, with the total the kiosk would
 * show (the server's own total for the change). The case then tests the agent, not the kiosk page.
 */
function standInBridge(store: MemoryStore, sessionId: string, kioskToken: string, kioskId: string, now: () => number) {
  const kiosk = getKiosk(kioskId);
  let reported = "";
  return store.subscribe(sessionId, (s) => {
    const p = s?.pendingBridgeCommand;
    if (!s || !p || p.commandId === reported) return;
    reported = p.commandId;
    const kioskTotal =
      p.type === "addToCart"
        ? cartTotal(addLine(kiosk, s.cart, p.args, now(), () => "standin").cart)
        : p.type === "removeFromCart"
          ? cartTotal(removeLine(s.cart, p.args.lineId))
          : s.total;
    const body = {
      sessionId,
      commandId: randomUUID(),
      type: "bridgeReport",
      args: { commandId: p.commandId, ok: true, kioskTotal, kioskLines: [] },
      source: "touch",
    };
    // After the command's transaction, as the real bridge reports a moment later.
    setTimeout(() => void runCommand(store, { body, bearer: kioskToken }, now()).catch(() => {}), 0);
  });
}

async function runCase(c: Case) {
  const store = new MemoryStore();
  const usage = new MemoryUsageStore();
  const started = Date.now();
  const now = () => EVAL_CLOCK + (Date.now() - started);
  const kioskId = c.kioskId ?? "malo";
  const { sessionId, deviceToken, kioskToken } = await createSession(store, { kioskId, demo: true }, now());
  const stopBridge = getKiosk(kioskId).learned ? standInBridge(store, sessionId, kioskToken, kioskId, now) : () => {};

  let chat = initialChat;
  let before: CartLine[] = [];
  let lastReply: string | null = null;
  // Every reply of the case, not only the last: "please wait" or "confirm card" can come mid-order.
  const internal = new Set<string>();
  // The detected language of each reply (codes only), for cases with `replyIn`.
  const languages: (string | null)[] = [];
  const allCalls: ToolCall[] = [];
  const requests: RequestLog[] = [];
  // Replies that were the generic "say that again" (15-judge-fixes:0): a user repeats the order and gets it twice.
  let genericRetries = 0;

  for (const turn of c.turns) {
    let message: string;
    let shown: string | undefined;
    if (typeof turn === "string") message = turn;
    else {
      // Like AssistantPanel's chooseDine (15-judge-fixes:1): the tap goes to the session; a held order is sent again
      // once the session has the dine option (a learned kiosk sets it after the bridge's report).
      const body = { sessionId, commandId: randomUUID(), type: "setDineOption", args: { option: turn.tapDine }, source: "button" };
      await runCommand(store, { body, bearer: deviceToken! }, now());
      for (let i = 0; i < 50 && (await store.get(sessionId))?.dineOption !== turn.tapDine; i++) await sleep(100);
      if (chat.held === null) continue;
      message = chat.held;
      shown = "Continuing your order…";
    }
    const session = (await store.get(sessionId))!;
    before = session.cart;
    const history = historyFor(chat.messages);
    chat = chatReducer(chat, { type: "send", text: message, shown });
    // Like AssistantPanel: the phone sends the confirm card's cartVersion only while the card shows.
    const input = {
      sessionId,
      chatRequestId: randomUUID(),
      message,
      history,
      utteranceSeq: chat.utteranceSeq,
      cartVersion: session.status === "confirming" ? session.cartVersion : undefined,
      locale: c.locale,
      ...(c.language ? { language: c.language } : {}),
      bearer: deviceToken!,
    };

    const calls: ToolCall[] = [];
    const known = session.recentCommandIds.length;
    let firstAt: number | null = null;
    const t0 = Date.now();
    const stop = store.subscribe(sessionId, (s) => {
      if (firstAt === null && s && s.recentCommandIds.length > known) firstAt = Date.now();
    });
    const rounds: number[] = [];
    const log: RequestLog = { ms: 0, firstToolMs: null, rounds, tools: calls };
    try {
      // A new client per request, as the route makes one: it keeps one request on one backend.
      const deps = () => ({ store, model: recording(geminiClient(), calls, rounds), usage, now });
      let out: Awaited<ReturnType<typeof runChat>>;
      try {
        out = await runChat(deps(), input);
      } catch (e) {
        if (!(e instanceof CommandError && e.code === "RATE_LIMITED")) throw e;
        // Same chatRequestId: commands already applied come back as duplicates instead of applying twice.
        await sleep(RETRY_WAIT_MS);
        out = await runChat(deps(), input);
      }
      const reply = out.reply;
      // A reply built from the results (14-final:5) sends them to no model, so their codes come from the actions.
      const unsent = calls.filter((c) => c.code === "unsent");
      if (unsent.length > 0) out.actions.slice(-unsent.length).forEach((a, i) => (unsent[i].code = a.code));
      chat = chatReducer(chat, { type: "reply", text: reply, heldForDine: out.heldForDine });
      lastReply = reply;
      if (reply === FALLBACK) genericRetries++;
      languages.push(replyLanguage(reply, getKiosk(kioskId)));
      for (const w of internalWords(reply, { replaying: Boolean(getKiosk(kioskId).learned) })) internal.add(w);
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
  stopBridge();
  const grounding = ("reply" in c.expect || "ask" in c.expect) && lastReply !== null ? checkGrounding(lastReply, getKiosk(kioskId)) : null;
  // Every reply in the expected language; one nothing decides (a bare name and price) passes unless it is the last.
  const languageMiss =
    c.replyIn && (languages.some((l) => l !== null && l !== c.replyIn) || languages.at(-1) !== c.replyIn)
      ? `reply language ${languages.map((l) => l ?? "?").join(",")}`
      : null;
  // Only the verdict is kept, never the reply.
  const payOffer = lastReply !== null && offersToPay(lastReply);
  const failure = requests.find((r) => r.error)
    ? `request error ${requests.find((r) => r.error)!.error}`
    : (judge(c, final, before, allCalls, grounding, payOffer, lastReply) ??
      (genericRetries > 0 ? "generic retry reply" : null) ??
      languageMiss ??
      (internal.size > 0 ? `internal words: ${[...internal].join(",")}` : null));
  return {
    id: c.id,
    kioskId,
    type: c.type,
    group: c.group ?? "original",
    locale: c.locale,
    ...(c.language ? { language: c.language } : {}),
    ...(c.replyIn ? { replyLanguages: languages } : {}),
    pass: failure === null,
    ...(failure ? { reason: failure } : {}),
    status: final.status,
    cart: cartIds(final.cart),
    pendingChoice: final.pendingChoice,
    staffCalled: final.staffCalled ? final.staffCalled.reasonCode : null,
    ...(grounding ? { grounding } : {}),
    // The matched words only, never the reply.
    ...(internal.size > 0 ? { internalWords: [...internal] } : {}),
    ...(genericRetries > 0 ? { genericRetries } : {}),
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
  const backend = textBackendSetting();
  if (backend !== "vertex" && !process.env.GEMINI_API_KEY) {
    console.error(`GEMINI_TEXT_BACKEND=${backend} needs GEMINI_API_KEY (.env).`);
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
  const startedAt = Date.now();

  const results = [];
  for (const c of cases) {
    const r = await runCase(c);
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
  const byKiosk = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const t = byKiosk.get(r.kioskId) ?? { pass: 0, total: 0 };
    t.total++;
    if (r.pass) t.pass++;
    byKiosk.set(r.kioskId, t);
  }
  // The earlier set and the 14-final:4 additions apart, so a regression on the old cases shows on its own.
  const byGroup = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const t = byGroup.get(r.group) ?? { pass: 0, total: 0 };
    t.total++;
    if (r.pass) t.pass++;
    byGroup.set(r.group, t);
  }
  const reqs = results.flatMap((r) => r.requests).filter((q) => !q.error);
  const totals = reqs.map((q) => q.ms);
  const firsts = reqs.flatMap((q) => (q.firstToolMs === null ? [] : [q.firstToolMs]));
  const roundMs = reqs.flatMap((q) => q.rounds);
  const latency = {
    requests: reqs.length,
    totalMedianMs: percentile(totals, 50),
    totalP90Ms: percentile(totals, 90),
    firstToolRequests: firsts.length,
    firstToolMedianMs: percentile(firsts, 50),
    firstToolP90Ms: percentile(firsts, 90),
    // Model calls (14-final:5): how many each request needed, and how long one took.
    modelCalls: roundMs.length,
    roundMedianMs: percentile(roundMs, 50),
    roundP90Ms: percentile(roundMs, 90),
    callsPerRequest: Object.fromEntries(
      [...new Set(reqs.map((q) => q.rounds.length))].sort((a, b) => a - b).map((n) => [n, reqs.filter((q) => q.rounds.length === n).length]),
    ),
    // Requests that changed something with a single model call: the reply was built from the tool results.
    oneCallWithTools: reqs.filter((q) => q.rounds.length === 1 && q.tools.length > 0).length,
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
    backend,
    modelCallsByBackend: served,
    thinkingLevel: thinking,
    evalClock: "14:00 KST",
    // Case ids given on the command line: a partial run, not a pass rate for the whole set.
    subset: only.length > 0 ? only : null,
    cases: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    byGroup: Object.fromEntries(byGroup),
    byKiosk: Object.fromEntries(byKiosk),
    byType: Object.fromEntries(byType),
    latency,
    notCovered: file.notCovered,
  };
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify({ ...summary, results }, null, 2) + "\n");

  const md = [
    `# Agent evaluation ${stamp} (KST)`,
    "",
    ...(only.length > 0 ? [`**Partial run** of ${only.length} case(s), not the whole set.`, ""] : []),
    `- Model: \`${modelId}\` on ${BACKEND_NAMES[backend]}, thinking level \`${thinking}\`, default temperature`,
    `- Model calls answered: Gemini API ${served.api}, Vertex AI ${served.vertex}`,
    `- Date: ${summary.date}; eval clock 14:00 KST; cases from \`evals/agent-cases.json\` (written by the KIBO team, not an external benchmark)`,
    `- Overall: **${passed}/${results.length} (${pct(passed, results.length || 1)})**`,
    `- Latency per request (${latency.requests} requests): median ${latency.totalMedianMs} ms, p90 ${latency.totalP90Ms} ms`,
    `- Until the first command is applied (${latency.firstToolRequests} requests): median ${latency.firstToolMedianMs} ms, p90 ${latency.firstToolP90Ms} ms`,
    `- Model calls: ${latency.modelCalls}, one call median ${latency.roundMedianMs} ms, p90 ${latency.roundP90Ms} ms; requests by calls ${JSON.stringify(latency.callsPerRequest)}; one call with tools ${latency.oneCallWithTools}`,
    "",
    "| Group | Pass |",
    "|---|---|",
    ...[...byGroup].map(([g, v]) => `| ${g} | ${v.pass}/${v.total} |`),
    "",
    "| Kiosk | Pass |",
    "|---|---|",
    ...[...byKiosk].map(([k, v]) => `| ${k} | ${v.pass}/${v.total} |`),
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
