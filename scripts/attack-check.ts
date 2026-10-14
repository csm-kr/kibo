// Forged-command check: sends the commands an attacker (or a confused AI) could forge and records that the server
// refuses each one with the documented status and code, and that the refused command changed nothing in the session.
// Two legit controls per rule family show the rules are not just refusing everything.
// Starts the local production build like scripts/load-check.ts (`node .next/standalone/server.js`, STORE=memory,
// ALLOW_MEMORY_STORE=1) on a free 127.0.0.1 port; never a deployed URL. No AI is called: no /api/chat, no /api/live-token.
// Each attempt comes from its own X-Forwarded-For (192.0.2.x, a documentation range), so per-IP limits never interfere.
// The evidence file holds names, statuses, codes and plain messages only: no tokens, claim tokens or session ids.
// Run with `npm run build` first, then `npm run check:attacks`.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { buildEvidence, matches, type AttemptRecord, type Expect, type Kind } from "./attacks";

const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETUP_IP = "192.0.2.250";
/** machine.ts CONFIRM_WAIT_MS: an AI confirm needs a new utterance at least this long after the review opened. */
const CONFIRM_WAIT_MS = 1500;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port: number) {
  const child = spawn(process.execPath, [join(ROOT, ".next/standalone/server.js")], {
    cwd: join(ROOT, ".next/standalone"),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", STORE: "memory", ALLOW_MEMORY_STORE: "1" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  return child;
}

function commit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

type Json = Record<string, unknown> & { ok?: boolean; error?: { code?: string; message?: string } };

class Check {
  records: AttemptRecord[] = [];
  /** Every token, claim token and session id seen, so the evidence can be checked against them. */
  secrets: string[] = [];
  private ip = 1;
  constructor(readonly base: string) {}

  async post(path: string, body: unknown, token: string | null, ip = SETUP_IP): Promise<{ status: number; json: Json }> {
    const res = await fetch(this.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    let json: Json = {};
    try {
      json = JSON.parse(await res.text()) as Json;
    } catch {
      // Not JSON: recorded with no code.
    }
    return { status: res.status, json };
  }

  /** A setup call that must succeed; on failure only the status and code are shown. */
  async legit(path: string, body: unknown, token: string | null): Promise<Json> {
    const r = await this.post(path, body, token);
    if (!r.json.ok) throw new Error(`Setup ${path} failed: ${r.status} ${r.json.error?.code ?? "no JSON"}`);
    return r.json;
  }

  /** The public session the screens see, read from the first event of the SSE stream. */
  async snapshot(sessionId: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const res = await fetch(`${this.base}/api/session/${sessionId}/events`, { headers: { "X-Forwarded-For": SETUP_IP }, signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Snapshot failed: ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new Error("Snapshot stream ended");
        buf += value;
        const data = buf.split("\n").find((l) => l.startsWith("data: "));
        if (data && buf.includes("\n\n")) return data.slice(6);
      }
    } finally {
      clearTimeout(timer);
      ctrl.abort();
    }
  }

  async session() {
    const created = await this.legit("/api/session", { kioskId: "malo" }, null);
    const sessionId = created.sessionId as string;
    const kioskToken = created.kioskToken as string;
    const claimToken = claimTokenOf(created.claimUrl as string);
    this.secrets.push(sessionId, kioskToken, claimToken);
    return { sessionId, kioskToken, claimToken };
  }

  async claim(sessionId: string, claimToken: string): Promise<string> {
    const deviceToken = (await this.legit("/api/session/claim", { sessionId, claimToken }, null)).deviceToken as string;
    this.secrets.push(deviceToken);
    return deviceToken;
  }

  /**
   * One attempt from its own address. For an attack on a real session, the public session is read before and after:
   * a refused command must leave it exactly as it was.
   */
  async attempt(spec: {
    name: string;
    kind?: Kind;
    tries: string;
    expected: Expect | Expect[];
    watch?: string;
    path?: string;
    body: unknown;
    token: string | null;
    note?: string;
  }): Promise<{ status: number; json: Json; record: AttemptRecord }> {
    const kind = spec.kind ?? "attack";
    const before = kind === "attack" && spec.watch ? await this.snapshot(spec.watch) : null;
    const r = await this.post(spec.path ?? "/api/command", spec.body, spec.token, `192.0.2.${this.ip++}`);
    const after = before !== null && spec.watch ? await this.snapshot(spec.watch) : null;
    const got = {
      status: r.status,
      ...(r.json.error?.code ? { code: r.json.error.code } : {}),
      ...(r.json.error?.message ? { message: r.json.error.message } : {}),
      ...(r.json.duplicate === true ? { duplicate: true } : {}),
      ...(r.json.ok && typeof r.json.status === "string" ? { sessionStatus: r.json.status } : {}),
      sessionUnchanged: before === null ? null : before === after,
    };
    const record: AttemptRecord = {
      name: spec.name,
      kind,
      tries: spec.tries,
      expected: spec.expected,
      got,
      pass: matches(spec.expected, got, kind),
      ...(spec.note ? { note: spec.note } : {}),
    };
    this.records.push(record);
    const mark = record.pass ? "ok  " : "FAIL";
    console.log(`${mark} ${kind === "control" ? "[control] " : ""}${spec.name}: ${got.status} ${got.code ?? ""}`);
    return { ...r, record };
  }
}

function claimTokenOf(claimUrl: string): string {
  const t = new URL(claimUrl).hash.replace(/^#t=/, "");
  if (!t) throw new Error("No claim token in the claim URL");
  return t;
}

const cmd = (sessionId: string, type: string, args: object, source: string, extra: object = {}) => ({
  sessionId,
  commandId: randomUUID(),
  type,
  args,
  source,
  ...extra,
});

const BURGER = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } };
const UNAUTHORIZED = { status: 401, code: "UNAUTHORIZED" };
const FORBIDDEN = { status: 403, code: "FORBIDDEN" };
const BAD_REQUEST = { status: 400, code: "BAD_REQUEST" };
const CONFLICT = { status: 409, code: "CONFLICT" };
const ON_THE_CARD = { ...CONFLICT, message: "Please confirm on the card." };
/** ARCHITECTURE "processing order" step 6 lists the catalog check with the 422 codes; cart.ts answers BAD_REQUEST. */
const CATALOG = [BAD_REQUEST, { status: 422 }];
const CATALOG_NOTE =
  "Catalog check (ARCHITECTURE processing order step 6). The step lists NEEDS_CHOICE/SOLD_OUT/UNAVAILABLE (422) for catalog failures; an unknown item or an option outside the item's groups is BAD_REQUEST in src/lib/commands/cart.ts. Either counts as refused; got shows which.";

async function run(c: Check) {
  // ---- Session A: a kiosk session claimed by a phone, with one burger in the cart ----
  const a = await c.session();
  const phoneA = await c.claim(a.sessionId, a.claimToken);
  await c.legit("/api/command", cmd(a.sessionId, "setDineOption", { option: "eat_in" }, "button"), phoneA);
  const added = cmd(a.sessionId, "addToCart", BURGER, "text", { utteranceSeq: 1 });
  await c.legit("/api/command", added, phoneA);
  const addToCart = (args: object) => cmd(a.sessionId, "addToCart", args, "text", { utteranceSeq: 2 });

  // Who may send it
  await c.attempt({ name: "no_token", tries: "addToCart with no Authorization header", expected: UNAUTHORIZED, watch: a.sessionId, body: addToCart(BURGER), token: null });
  await c.attempt({ name: "wrong_token", tries: "addToCart with a random token of the right shape", expected: UNAUTHORIZED, watch: a.sessionId, body: addToCart(BURGER), token: randomBytes(32).toString("base64url") });
  await c.attempt({ name: "phone_card_action", tries: "The phone's device token sends cardAction (the payment step)", expected: FORBIDDEN, watch: a.sessionId, body: cmd(a.sessionId, "cardAction", {}, "button"), token: phoneA });
  await c.attempt({ name: "phone_touch_source", tries: "The phone sends addToCart with source \"touch\" (the kiosk's source)", expected: BAD_REQUEST, watch: a.sessionId, body: cmd(a.sessionId, "addToCart", BURGER, "touch"), token: phoneA });
  await c.attempt({ name: "kiosk_voice_source", tries: "The kiosk token sends addToCart with source \"voice\" (the phone AI's source)", expected: BAD_REQUEST, watch: a.sessionId, body: cmd(a.sessionId, "addToCart", BURGER, "voice"), token: a.kioskToken });
  await c.attempt({ name: "kiosk_card_action_while_ordering", tries: "The kiosk sends cardAction in `ordering`, before any review or confirm", expected: CONFLICT, watch: a.sessionId, body: cmd(a.sessionId, "cardAction", {}, "touch"), token: a.kioskToken });

  // Arguments
  await c.attempt({ name: "qty_0", tries: "addToCart with qty 0", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, qty: 0 }), token: phoneA });
  await c.attempt({ name: "qty_11", tries: "addToCart with qty 11 (max 10)", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, qty: 11 }), token: phoneA });
  await c.attempt({ name: "qty_negative", tries: "addToCart with qty -1", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, qty: -1 }), token: phoneA });
  await c.attempt({ name: "qty_fraction", tries: "addToCart with qty 1.5", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, qty: 1.5 }), token: phoneA });
  await c.attempt({ name: "client_price", tries: "addToCart with an extra unitPrice: 0 argument (a price from the client)", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, unitPrice: 0 }), token: phoneA });
  await c.attempt({ name: "unknown_item", tries: "addToCart of an itemId that is not in the menu data", expected: CATALOG, note: CATALOG_NOTE, watch: a.sessionId, body: addToCart({ itemId: "golden_burger", qty: 1 }), token: phoneA });
  await c.attempt({ name: "option_of_another_item", tries: "addToCart of the burger set with the nuggets' sauce (sweet_chili) as its side", expected: CATALOG, note: CATALOG_NOTE, watch: a.sessionId, body: addToCart({ ...BURGER, selections: { drink: ["cola"], side: ["sweet_chili"] } }), token: phoneA });
  await c.attempt({ name: "group_of_another_item", tries: "addToCart of the burger set with a sauce group (only the nuggets have one)", expected: CATALOG, note: CATALOG_NOTE, watch: a.sessionId, body: addToCart({ ...BURGER, selections: { drink: ["cola"], sauce: ["bbq"] } }), token: phoneA });
  await c.attempt({ name: "string_600_chars", tries: "addToCart with a 600-character itemId (ids are capped at 64)", expected: BAD_REQUEST, watch: a.sessionId, body: addToCart({ ...BURGER, itemId: "x".repeat(600) }), token: phoneA });
  await c.attempt({ name: "unknown_command_type", tries: "A command type that does not exist (\"markPaid\")", expected: BAD_REQUEST, watch: a.sessionId, body: cmd(a.sessionId, "markPaid", {}, "button"), token: phoneA });
  await c.attempt({ name: "session_id_with_slash", tries: "sessionId \"a/b\" (a path separator that would reach a Firestore document path)", expected: BAD_REQUEST, body: { ...addToCart(BURGER), sessionId: "a/b" }, token: phoneA });
  await c.attempt({ name: "unknown_session", tries: "A well-formed sessionId that does not exist", expected: { status: 404, code: "NOT_FOUND" }, body: { ...addToCart(BURGER), sessionId: randomBytes(16).toString("base64url") }, token: phoneA });

  // Replay
  await c.attempt({ name: "replayed_command_id", tries: "Resends the applied addToCart with the same commandId", expected: { status: 200, duplicate: true }, watch: a.sessionId, body: added, token: phoneA, note: "A retry is answered with the current state and duplicate: true; sessionUnchanged shows nothing was applied." });

  // The AI cannot confirm on its own: the phone's AI opens the review with utteranceSeq 5
  const review = await c.legit("/api/command", cmd(a.sessionId, "requestCheckout", {}, "text", { utteranceSeq: 5 }), phoneA);
  const reviewedAt = Date.now();
  const v = review.cartVersion as number;
  const confirm = (source: string, extra: object) => cmd(a.sessionId, "confirmCheckout", {}, source, extra);
  const tooSoon = await c.attempt({ name: "ai_confirm_too_soon", tries: "AI confirmCheckout with a new utteranceSeq (6) but less than 1.5 s after the review opened", expected: ON_THE_CARD, watch: a.sessionId, body: confirm("voice", { cartVersion: v, utteranceSeq: 6 }), token: phoneA });
  tooSoon.record.note = `Sent within ${Date.now() - reviewedAt} ms of the review opening (the attempt must land before ${CONFIRM_WAIT_MS} ms).`;
  await c.attempt({ name: "ai_confirm_same_utterance", tries: "AI confirmCheckout with the utteranceSeq that opened the review (5): the same user turn", expected: ON_THE_CARD, watch: a.sessionId, body: confirm("text", { cartVersion: v, utteranceSeq: 5 }), token: phoneA });
  await c.attempt({ name: "ai_confirm_without_utterance", tries: "AI confirmCheckout with no utteranceSeq at all", expected: ON_THE_CARD, watch: a.sessionId, body: confirm("voice", { cartVersion: v }), token: phoneA });
  await c.attempt({ name: "stale_cart_version", tries: "A confirm-card tap carrying an older cartVersion than the one under review", expected: { ...CONFLICT, message: "Your order changed. Please check it again." }, watch: a.sessionId, body: confirm("button", { cartVersion: v - 1 }), token: phoneA });
  await c.attempt({ name: "missing_cart_version", tries: "A confirm-card tap with no cartVersion", expected: { ...CONFLICT, message: "Your order changed. Please check it again." }, watch: a.sessionId, body: confirm("button", {}), token: phoneA });
  await c.attempt({ name: "kiosk_card_action_while_confirming", tries: "The kiosk sends cardAction in `confirming`, before the confirm", expected: CONFLICT, watch: a.sessionId, body: cmd(a.sessionId, "cardAction", {}, "touch"), token: a.kioskToken });

  await sleep(Math.max(0, CONFIRM_WAIT_MS + 200 - (Date.now() - reviewedAt)));
  await c.attempt({ name: "ai_confirm_new_utterance_after_wait", kind: "control", tries: "AI confirmCheckout with a new utteranceSeq (6), matching cartVersion, more than 1.5 s after the AI opened the review", expected: { status: 200 }, body: confirm("voice", { cartVersion: v, utteranceSeq: 6 }), token: phoneA });

  // In `paying`: only the kiosk's card action reaches `paid`
  for (const source of ["voice", "text", "button"]) {
    await c.attempt({ name: `phone_card_action_${source}_while_paying`, tries: `The phone sends cardAction with source "${source}" in \`paying\``, expected: FORBIDDEN, watch: a.sessionId, body: cmd(a.sessionId, "cardAction", {}, source), token: phoneA });
  }
  await c.attempt({ name: "phone_paid_command_type", tries: "The phone sends a made-up command type \"paid\" in `paying`", expected: BAD_REQUEST, watch: a.sessionId, body: cmd(a.sessionId, "paid", {}, "button"), token: phoneA });
  await c.attempt({ name: "phone_status_paid_argument", tries: "The phone sends confirmCheckout with args { status: \"paid\" } in `paying`", expected: BAD_REQUEST, watch: a.sessionId, body: cmd(a.sessionId, "confirmCheckout", { status: "paid" }, "button", { cartVersion: v }), token: phoneA });
  await c.attempt({ name: "kiosk_card_action_while_paying", kind: "control", tries: "The kiosk's card action in `paying`", expected: { status: 200 }, body: cmd(a.sessionId, "cardAction", {}, "touch"), token: a.kioskToken });
  await c.attempt({ name: "second_card_action_after_paid", tries: "The kiosk sends cardAction again after `paid` (a second payment / order number)", expected: { ...CONFLICT, message: "This order is already paid." }, watch: a.sessionId, body: cmd(a.sessionId, "cardAction", {}, "touch"), token: a.kioskToken });

  // ---- Session B: claims, reissued QR, tokens from another session ----
  const b = await c.session();
  const phoneB1 = await c.claim(b.sessionId, b.claimToken);
  await c.attempt({ name: "second_phone_claim", tries: "A second phone claims the same session with the same QR claim token", expected: { ...CONFLICT, message: "Someone else is using this kiosk." }, watch: b.sessionId, path: "/api/session/claim", body: { sessionId: b.sessionId, claimToken: b.claimToken }, token: null });
  const reissued = await c.legit("/api/command", cmd(b.sessionId, "reissueClaim", {}, "touch"), b.kioskToken);
  const newClaim = claimTokenOf(reissued.claimUrl as string);
  c.secrets.push(newClaim);
  await c.attempt({ name: "old_device_token_after_reissue", tries: "The first phone's device token sends addToCart after the kiosk reissued the QR", expected: UNAUTHORIZED, watch: b.sessionId, body: cmd(b.sessionId, "addToCart", BURGER, "text", { utteranceSeq: 1 }), token: phoneB1 });
  await c.attempt({ name: "old_claim_token_after_reissue", tries: "Claims with the QR claim token that the reissue replaced", expected: UNAUTHORIZED, watch: b.sessionId, path: "/api/session/claim", body: { sessionId: b.sessionId, claimToken: b.claimToken }, token: null });
  const claimedB2 = await c.attempt({ name: "claim_reissued_qr", kind: "control", tries: "A new phone claims the reissued QR", expected: { status: 200 }, path: "/api/session/claim", body: { sessionId: b.sessionId, claimToken: newClaim }, token: null });
  if (typeof claimedB2.json.deviceToken === "string") c.secrets.push(claimedB2.json.deviceToken);
  await c.attempt({ name: "cross_session_device_token", tries: "Session A's device token sends addToCart to session B", expected: UNAUTHORIZED, watch: b.sessionId, body: cmd(b.sessionId, "addToCart", BURGER, "text", { utteranceSeq: 1 }), token: phoneA });
  await c.attempt({ name: "cross_session_kiosk_token", tries: "Session A's kiosk token sends reissueClaim to session B (to take its QR)", expected: UNAUTHORIZED, watch: b.sessionId, body: cmd(b.sessionId, "reissueClaim", {}, "touch"), token: a.kioskToken });

  // ---- Session C: the kiosk opens the review, so the phone's AI can never confirm it ----
  const k = await c.session();
  const phoneC = await c.claim(k.sessionId, k.claimToken);
  await c.legit("/api/command", cmd(k.sessionId, "setDineOption", { option: "take_out" }, "touch"), k.kioskToken);
  await c.legit("/api/command", cmd(k.sessionId, "addToCart", BURGER, "touch"), k.kioskToken);
  const kioskReview = await c.legit("/api/command", cmd(k.sessionId, "requestCheckout", {}, "touch"), k.kioskToken);
  const vc = kioskReview.cartVersion as number;
  await sleep(CONFIRM_WAIT_MS + 200);
  await c.attempt({ name: "ai_confirm_on_kiosk_review", tries: "AI confirmCheckout (new utteranceSeq 99, matching cartVersion, after 1.5 s) on a review the kiosk opened", expected: ON_THE_CARD, watch: k.sessionId, body: cmd(k.sessionId, "confirmCheckout", {}, "voice", { cartVersion: vc, utteranceSeq: 99 }), token: phoneC });
  await c.attempt({ name: "tap_confirm_matching_version", kind: "control", tries: "A tap on the phone's confirm card with the matching cartVersion", expected: { status: 200 }, body: cmd(k.sessionId, "confirmCheckout", {}, "button", { cartVersion: vc }), token: phoneC });
  await c.attempt({ name: "kiosk_card_action_after_tap_confirm", kind: "control", tries: "The kiosk's card action after the tap confirm", expected: { status: 200 }, body: cmd(k.sessionId, "cardAction", {}, "touch"), token: k.kioskToken });
}

async function main() {
  if (!existsSync(join(ROOT, ".next/standalone/server.js"))) throw new Error("No production build: run `npm run build` first.");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("The attack check only targets the local server.");
  const server = startServer(port);
  const stop = () => {
    if (server.exitCode === null) server.kill("SIGTERM");
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  try {
    const ready = Date.now() + 60_000;
    for (;;) {
      if (server.exitCode !== null) throw new Error(`Server exited (${server.exitCode})`);
      const st = await fetch(`${base}/api/health`, { headers: { "X-Forwarded-For": SETUP_IP } }).then((r) => r.status, () => 0);
      if (st === 200) break;
      if (Date.now() > ready) throw new Error("Server did not start within 60 s");
      await sleep(300);
    }
    console.log(`server up on ${base}`);

    const check = new Check(base);
    await run(check);

    const evidence = buildEvidence(
      {
        what: "Forged commands sent to POST /api/command and POST /api/session/claim; each must be refused with the documented status and code and leave the public session unchanged. Controls are legit commands that must go through.",
        date: new Date().toISOString(),
        commit: commit(),
        script: "scripts/attack-check.ts (npm run check:attacks)",
        target: "Local production build (node .next/standalone/server.js, NODE_ENV=production, STORE=memory) on http://127.0.0.1:<free port>; never the deployed service",
        rulesFrom: ["docs/ARCHITECTURE.md (API, Commands and actors, /api/command processing order)", "docs/SECURITY.md (Identity and permissions, Command handling)"],
        method: "Each attempt comes from its own X-Forwarded-For (192.0.2.x). For attacks on a live session, the public session (first event of GET /api/session/{id}/events) is read before and after; sessionUnchanged true means the refused command changed nothing. No AI is called (no /api/chat, no /api/live-token).",
        omitted: "Tokens, claim tokens, session ids and command ids are never written here.",
      },
      check.records,
      check.secrets,
    );
    writeFileSync(join(ROOT, "evidence/forged-commands.json"), JSON.stringify(evidence, null, 2) + "\n");
    const s = evidence.summary;
    console.log(`attacks refused as expected ${s.refusedAsExpected}/${s.attacks}, controls ${s.controlsAsExpected}/${s.controls}, unexpected ${s.unexpected}${s.unexpected ? `: ${s.unexpectedNames.join(", ")}` : ""}`);
    console.log("wrote evidence/forged-commands.json");
    if (s.unexpected > 0) process.exitCode = 1;
  } finally {
    stop();
    await sleep(300);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
