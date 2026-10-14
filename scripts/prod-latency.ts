// Typed latency on production (phases/14-final step 7): one /demo-style session on the deployed service, and the six
// typed turns of the hero order sent to POST /api/chat one after another, as a judge would type them. Measures each
// request end to end from this machine (network included) and writes evidence/prod-latency.json.
// Costs 6 chat messages on the deployed service. The file holds statuses, tool names, result codes, cart counts and
// timings only: no tokens, session ids or reply text. Replies are kept in memory for the history and then dropped.
// Run with `npm run measure:prod-latency` (`-- --url=https://…` for another deployment).

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "https://kibo-407514467119.asia-northeast3.run.app";
const BASE = (process.argv.find((a) => a.startsWith("--url="))?.slice(6) ?? DEFAULT_URL).replace(/\/$/, "");

const TURNS = [
  "For here, please.",
  "Two cheeseburger sets. One without pickles; drinks zero cola and cider.",
  "Make both fries large.",
  "No, thanks.",
  "That's all, I'll pay.",
  "Yes, pay now.",
];

interface ChatReply {
  ok: boolean;
  reply?: string;
  status?: string;
  cart?: unknown[];
  total?: number;
  cartVersion?: number;
  actions?: { tool: string; code: string }[];
  error?: { code: string };
}

async function post<T>(path: string, body: unknown, token?: string): Promise<{ status: number; json: T; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  return { status: res.status, json, ms: Math.round(performance.now() - t0) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as { revision?: string; version?: string };
  const created = await post<{ ok: boolean; sessionId: string; deviceToken: string }>("/api/session", { kioskId: "malo", demo: true });
  if (!created.json.ok) throw new Error(`session refused (${created.status})`);
  const { sessionId, deviceToken } = created.json;

  const history: { role: "user" | "model"; text: string }[] = [];
  const turns = [];
  let cartVersion: number | undefined;
  for (const [i, message] of TURNS.entries()) {
    const body = {
      sessionId,
      chatRequestId: randomUUID(),
      message,
      history: history.slice(-10),
      utteranceSeq: i + 1,
      locale: "en",
      ...(cartVersion !== undefined ? { cartVersion } : {}),
    };
    const r = await post<ChatReply>("/api/chat", body, deviceToken);
    history.push({ role: "user", text: message }, { role: "model", text: r.json.reply ?? "" });
    if (r.json.ok) cartVersion = r.json.cartVersion;
    turns.push({
      turn: i + 1,
      message,
      httpStatus: r.status,
      ok: r.json.ok,
      error: r.json.error?.code ?? null,
      sessionStatus: r.json.status ?? null,
      actions: (r.json.actions ?? []).map((a) => `${a.tool}:${a.code}`),
      cartLines: r.json.cart?.length ?? null,
      total: r.json.total ?? null,
      ms: r.ms,
    });
    console.log(`turn ${i + 1}: ${r.status} ${r.ms} ms ${r.json.status ?? r.json.error?.code ?? ""}`);
  }

  const ms = turns.filter((t) => t.ok).map((t) => t.ms);
  const out = {
    about:
      "Typed hero order on the deployed service: one demo session (POST /api/session, demo: true), then 6 typed turns " +
      "sent to POST /api/chat one after another with the phone's history, locale en, from a laptop in Seoul over the " +
      "internet. ms = request sent to JSON received, measured on the client (network included). The text backend and " +
      "the code are whatever the named revision runs; reply text is not kept. One run, no retries (R-001).",
    url: BASE,
    revision: health.revision ?? null,
    version: health.version ?? null,
    at: new Date().toISOString(),
    turns,
    summary: {
      turns: turns.length,
      ok: ms.length,
      medianMs: ms.length ? median(ms) : null,
      minMs: ms.length ? Math.min(...ms) : null,
      maxMs: ms.length ? Math.max(...ms) : null,
      totalMs: ms.reduce((a, b) => a + b, 0),
      finalStatus: turns.at(-1)?.sessionStatus ?? null,
    },
  };
  writeFileSync(join(process.cwd(), "evidence/prod-latency.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out.summary));
}

main().catch((e) => {
  console.error("prod latency failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
