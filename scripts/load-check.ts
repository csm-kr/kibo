// Load check (phases/11-hardening step 3): what breaks first when several judges open /demo at once.
// Starts the local production build on a free localhost port, with STORE=memory and ALLOW_MEMORY_STORE=1: the standalone
// server Cloud Run runs (`node .next/standalone/server.js`, Dockerfile), because `npm run start` warns that `next start`
// does not work with `output: standalone`. It simulates N concurrent demo users through the HTTP API and stops the
// server at the end.
// Each user: creates a demo session, opens the kiosk's and the phone's SSE streams, pings from both, taps the dine
// option, adds the hero order, makes both fries large, opens the review, confirms with a tap and pays with the
// stand-in card action, then closes. Streams stay open until every user of the scenario is done, like open screens.
// Only the N = 5 scenario calls Gemini: one real /api/chat message per user (5 in total) instead of the two adds.
// Never targets a deployed URL: the base URL is always http://127.0.0.1:<free port>, and no URL argument is read.
// The evidence file holds counts, timings and error codes and messages only: no tokens, session ids or replies.
// Run with `npm run build` first, then `npm run load:check` (`-- --no-chat` skips the Gemini calls, for a dry run;
// the evidence file is then not written).

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { cpus, platform, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

const SSE_WAIT_MS = 5_000;
const CHAT = !process.argv.includes("--no-chat");
const HERO_MESSAGE = "Two cheeseburger sets. One without pickles; drinks zero cola and cider.";

// ---- Server ----

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

interface ProbeSample {
  rss: number;
  heapUsed: number;
  handles: Record<string, number>;
  total: number;
}

function startServer(port: number, probeDir: string) {
  const stderr: string[] = [];
  const child = spawn(process.execPath, [join(ROOT, ".next/standalone/server.js")], {
    cwd: join(ROOT, ".next/standalone"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      STORE: "memory",
      ALLOW_MEMORY_STORE: "1",
      // The product default (ARCHITECTURE "Region and secrets"); the local .env may pin `api` (I-125).
      GEMINI_TEXT_BACKEND: "auto",
      NODE_OPTIONS: `--import ${pathToFileURL(join(ROOT, "scripts/load-probe.mjs")).href}`,
      LOAD_PROBE_DIR: probeDir,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => stderr.push(...d.split("\n").filter(Boolean)));
  return { child, stderr };
}

/** The server's own snapshot: the probe file of the process that holds the listening socket. */
function readProbe(probeDir: string): ProbeSample | null {
  for (const name of readdirSync(probeDir)) {
    try {
      const s = JSON.parse(readFileSync(join(probeDir, name), "utf8")) as Omit<ProbeSample, "total">;
      if (!s.handles.TCPServerWrap) continue;
      return { ...s, total: Object.values(s.handles).reduce((a, b) => a + b, 0) };
    } catch {
      // Caught mid-write; the next read gets it.
    }
  }
  return null;
}

// ---- HTTP ----

interface CallRecord {
  route: string;
  status: number;
  ms: number;
  at: number;
  code?: string;
  message?: string;
  polite: boolean;
}

/** Polite: a JSON body with ok, and on failure a plain message and code, never a 500 or a dropped connection. */
function isPolite(status: number, json: unknown): boolean {
  if (status === 0 || status >= 500) return false;
  const j = json as { ok?: boolean; error?: { code?: unknown; message?: unknown } } | null;
  if (!j || typeof j.ok !== "boolean") return false;
  if (j.ok) return status < 300;
  return typeof j.error?.code === "string" && typeof j.error.message === "string" && j.error.message.length > 0 && !/\bat \S+:\d+/.test(j.error.message);
}

class Scenario {
  calls: CallRecord[] = [];
  sseDelays: number[] = [];
  sseMissed = 0;
  chatMs: number[] = [];
  chatOutcomes: string[] = [];
  readonly t0 = now();
  constructor(readonly base: string) {}

  async call(ip: string, path: string, body: object, token?: string) {
    const t = now();
    let status = 0;
    let json: unknown = null;
    try {
      const res = await fetch(this.base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      status = res.status;
      json = JSON.parse(await res.text());
    } catch {
      // status 0 or a non-JSON body: recorded as impolite.
    }
    this.record(path, status, t, json);
    return { status, json: json as Record<string, unknown> & { ok?: boolean } };
  }

  record(path: string, status: number, t: number, json: unknown) {
    const route = path.startsWith("/api/session/") && path.endsWith("/events") ? "/api/session/{id}/events" : path;
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    this.calls.push({ route, status, ms: now() - t, at: t - this.t0, code: err?.code, message: err?.message, polite: isPolite(status, json) });
  }
}

interface Stream {
  waitFor(commandId: string, after: number): Promise<number | null>;
  close(): void;
}

/** Opens one SSE stream; null when the server refused it (recorded). */
async function openStream(scn: Scenario, ip: string, sessionId: string): Promise<Stream | null> {
  const path = `/api/session/${sessionId}/events`;
  const ctrl = new AbortController();
  const t = now();
  let res: Response;
  try {
    res = await fetch(scn.base + path, { headers: { "X-Forwarded-For": ip }, signal: ctrl.signal });
  } catch {
    scn.record(path, 0, t, null);
    return null;
  }
  if (!res.ok || !res.body) {
    let json: unknown = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      // impolite
    }
    scn.record(path, res.status, t, json);
    return null;
  }
  scn.record(path, res.status, t, { ok: true });

  const events: { at: number; ids: string[] }[] = [];
  let wake = () => {};
  void (async () => {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += value;
      let cut: number;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = block.split("\n").find((l) => l.startsWith("data: "));
        if (!data || block.startsWith("event: gone")) continue;
        const s = JSON.parse(data.slice(6)) as { recentCommandIds?: string[] };
        events.push({ at: now(), ids: s.recentCommandIds ?? [] });
        wake();
      }
    }
  })().catch(() => {});

  return {
    async waitFor(commandId, after) {
      const deadline = now() + SSE_WAIT_MS;
      for (;;) {
        const hit = events.find((e) => e.ids.includes(commandId));
        if (hit) return hit.at - after;
        const left = deadline - now();
        if (left <= 0) return null;
        await new Promise<void>((r) => {
          const timer = setTimeout(r, Math.min(left, 200));
          wake = () => {
            clearTimeout(timer);
            r();
          };
        });
      }
    },
    close: () => ctrl.abort(),
  };
}

// ---- One demo user ----

class FlowStop extends Error {}

interface Line {
  lineId: string;
  selections: Record<string, string[]>;
}

async function demoUser(scn: Scenario, ip: string, withChat: boolean, streams: Stream[]): Promise<{ paid: boolean; streams: number; stoppedAt?: string }> {
  const created = await scn.call(ip, "/api/session", { kioskId: "malo", demo: true });
  if (!created.json?.ok) return { paid: false, streams: 0, stoppedAt: "createSession" };
  const { sessionId, kioskToken, deviceToken } = created.json as unknown as { sessionId: string; kioskToken: string; deviceToken: string };

  const own = (await Promise.all([openStream(scn, ip, sessionId), openStream(scn, ip, sessionId)])).filter((s): s is Stream => s !== null);
  streams.push(...own);

  let seq = 0;
  const command = async (type: string, args: object, source: string, extra: object = {}) => {
    const commandId = randomUUID();
    const token = source === "touch" ? kioskToken : deviceToken;
    const r = await scn.call(ip, "/api/command", { sessionId, commandId, type, args, source, ...extra }, token);
    const at = now();
    if (!r.json?.ok) throw new FlowStop(type);
    for (const d of await Promise.all(own.map((s) => s.waitFor(commandId, at)))) {
      if (d === null) scn.sseMissed++;
      else scn.sseDelays.push(d);
    }
    return r.json as unknown as { cart: Line[]; cartVersion: number; status: string };
  };

  try {
    for (const token of [kioskToken, deviceToken]) {
      const p = await scn.call(ip, "/api/ping", { sessionId, active: true }, token);
      if (!p.json?.ok) throw new FlowStop("ping");
    }
    await command("setDineOption", { option: "eat_in" }, "button");

    let cart: Line[] = [];
    if (withChat) {
      const t = now();
      const r = await scn.call(ip, "/api/chat", { sessionId, chatRequestId: randomUUID(), message: HERO_MESSAGE, history: [], utteranceSeq: ++seq, locale: "en" }, deviceToken);
      scn.chatMs.push(now() - t);
      const err = (r.json as { error?: { code?: string } }).error;
      cart = r.json?.ok ? ((r.json as unknown as { cart: Line[] }).cart ?? []) : [];
      scn.chatOutcomes.push(r.json?.ok ? `ok, ${cart.length} lines` : `${r.status} ${err?.code ?? "no JSON"}`);
    }
    if (cart.length === 0) {
      seq++;
      await command("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } }, "text", { utteranceSeq: seq });
      cart = (await command("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } }, "text", { utteranceSeq: seq })).cart;
    }
    seq++;
    for (const line of cart.filter((l) => l.selections.side)) {
      await command("updateCart", { lineId: line.lineId, changes: { selections: { ...line.selections, side: ["fries_l"] } } }, "text", { utteranceSeq: seq });
    }
    const review = await command("requestCheckout", {}, "text", { utteranceSeq: ++seq });
    await command("confirmCheckout", {}, "button", { cartVersion: review.cartVersion });
    const paid = await command("cardAction", {}, "touch");
    return { paid: paid.status === "paid", streams: own.length };
  } catch (e) {
    if (e instanceof FlowStop) return { paid: false, streams: own.length, stoppedAt: e.message };
    throw e;
  }
}

// ---- Scenarios ----

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.max(0, Math.ceil(p * s.length) - 1)]);
}

interface ScenarioSpec {
  name: string;
  users: number;
  /** One X-Forwarded-For per user, or one for all. */
  ips: (i: number) => string;
  chat: boolean;
}

async function runScenario(spec: ScenarioSpec, base: string, probeDir: string) {
  const scn = new Scenario(base);
  const before = readProbe(probeDir);
  let peak = before;
  const sampler = setInterval(() => {
    const s = readProbe(probeDir);
    if (s && peak && s.rss > peak.rss) peak = { ...peak, rss: s.rss };
    if (s && peak && s.heapUsed > peak.heapUsed) peak = { ...peak, heapUsed: s.heapUsed };
    if (s && peak && s.total > peak.total) peak = { ...peak, total: s.total, handles: s.handles };
  }, 100);

  const streams: Stream[] = [];
  const results = await Promise.all(Array.from({ length: spec.users }, (_, i) => demoUser(scn, spec.ips(i), spec.chat, streams)));
  const elapsedMs = Math.round(now() - scn.t0);
  await sleep(500);
  const held = readProbe(probeDir);
  for (const s of streams) s.close();
  // Idle keep-alive sockets close after the server's 5 s keep-alive timeout; anything left after that is held.
  await sleep(6000);
  clearInterval(sampler);
  const after = readProbe(probeDir);

  const health = await fetch(`${base}/api/health`, { headers: { "X-Forwarded-For": "203.0.113.250" } }).then((r) => r.status, () => 0);
  const failures = scn.calls.filter((c) => c.status < 200 || c.status >= 300).sort((a, b) => a.at - b.at);
  const byRoute: Record<string, Record<string, number>> = {};
  for (const c of scn.calls) {
    const key = c.status >= 200 && c.status < 300 ? String(c.status) : `${c.status} ${c.code ?? "no JSON"}`;
    byRoute[c.route] ??= {};
    byRoute[c.route][key] = (byRoute[c.route][key] ?? 0) + 1;
  }
  const commandMs = scn.calls.filter((c) => c.route === "/api/command" && c.status === 200).map((c) => c.ms);
  const mb = (n: number | undefined) => (n === undefined ? null : Math.round((n / 1024 / 1024) * 10) / 10);

  return {
    name: spec.name,
    users: spec.users,
    addresses: new Set(Array.from({ length: spec.users }, (_, i) => spec.ips(i))).size,
    chatPerUser: spec.chat ? 1 : 0,
    elapsedMs,
    paid: results.filter((r) => r.paid).length,
    fullSuccess: results.filter((r) => r.paid && r.streams === 2).length,
    successRate: Math.round((results.filter((r) => r.paid && r.streams === 2).length / spec.users) * 1000) / 1000,
    streamsOpened: results.reduce((a, r) => a + r.streams, 0),
    stoppedAt: Object.fromEntries(
      [...new Set(results.map((r) => r.stoppedAt).filter(Boolean))].map((k) => [k, results.filter((r) => r.stoppedAt === k).length]),
    ),
    requests: scn.calls.length,
    commandLatencyMs: { n: commandMs.length, p50: percentile(commandMs, 0.5), p90: percentile(commandMs, 0.9), max: percentile(commandMs, 1) },
    // Time from a command's response to the SSE event that carries its commandId, on each open stream of that user.
    // Negative: the event arrived before the response.
    sseEventDelayMs: { n: scn.sseDelays.length, p50: percentile(scn.sseDelays, 0.5), p90: percentile(scn.sseDelays, 0.9), max: percentile(scn.sseDelays, 1), missed: scn.sseMissed },
    ...(spec.chat ? { chat: { latencyMs: scn.chatMs.map(Math.round), outcomes: scn.chatOutcomes } } : {}),
    responses: byRoute,
    firstFailure: failures[0] ? { route: failures[0].route, status: failures[0].status, code: failures[0].code, message: failures[0].message, atMs: Math.round(failures[0].at) } : null,
    distinctFailures: [...new Set(failures.map((f) => `${f.route} ${f.status} ${f.code ?? ""}: ${f.message ?? "(no JSON)"}`))],
    allPolite: scn.calls.every((c) => c.polite),
    impolite: scn.calls.filter((c) => !c.polite).length,
    healthAfter: health,
    server: {
      rssMb: { before: mb(before?.rss), peak: mb(peak?.rss), streamsOpen: mb(held?.rss), after: mb(after?.rss) },
      heapUsedMb: { before: mb(before?.heapUsed), peak: mb(peak?.heapUsed), streamsOpen: mb(held?.heapUsed), after: mb(after?.heapUsed) },
      openHandles: { before: before?.total ?? null, streamsOpen: held?.total ?? null, peak: peak?.total ?? null, after: after?.total ?? null },
      handlesByTypeStreamsOpen: held?.handles ?? null,
      handlesByTypeAfter: after?.handles ?? null,
    },
  };
}

/** After the streams of an address closed, it must get all its places back (openStream releases on close). */
async function releaseCheck(base: string, ip: string, sessionId: string) {
  const scn = new Scenario(base);
  const streams = (await Promise.all(Array.from({ length: 10 }, () => openStream(scn, ip, sessionId)))).filter((s): s is Stream => s !== null);
  const eleventh = await openStream(scn, ip, sessionId);
  const statuses = scn.calls.map((c) => c.status);
  for (const s of [...streams, ...(eleventh ? [eleventh] : [])]) s.close();
  await sleep(1000);
  return { ip, opened: streams.length, eleventhStatus: statuses[10] ?? null, eleventhMessage: scn.calls[10]?.message ?? null };
}

async function main() {
  if (!existsSync(join(ROOT, ".next/standalone/server.js"))) throw new Error("No production build: run `npm run build` first.");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("The load check only targets the local server.");
  const probeDir = mkdtempSync(join(tmpdir(), "kibo-load-"));
  const server = startServer(port, probeDir);
  const stop = () => {
    if (server.child.exitCode === null) server.child.kill("SIGTERM");
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  try {
    const ready = Date.now() + 60_000;
    for (;;) {
      if (server.child.exitCode !== null) throw new Error(`Server exited (${server.child.exitCode})`);
      const st = await fetch(`${base}/api/health`).then((r) => r.status, () => 0);
      if (st === 200 && readProbe(probeDir)) break;
      if (Date.now() > ready) throw new Error("Server did not start within 60 s");
      await sleep(300);
    }
    console.log(`server up on ${base}`);
    const idle = readProbe(probeDir);

    // Each scenario uses its own addresses (documentation ranges), so per-minute windows never carry over.
    const specs: ScenarioSpec[] = [
      { name: "5 users, own addresses, 1 real /api/chat each", users: 5, ips: (i) => `198.51.100.${1 + i}`, chat: CHAT },
      { name: "10 users, own addresses", users: 10, ips: (i) => `198.51.100.${11 + i}`, chat: false },
      { name: "20 users, own addresses", users: 20, ips: (i) => `198.51.100.${31 + i}`, chat: false },
      // Judges behind one office address (I-154).
      { name: "5 users, one shared address", users: 5, ips: () => "203.0.113.5", chat: false },
      { name: "20 users, one shared address", users: 20, ips: () => "203.0.113.7", chat: false },
    ];
    const scenarios = [];
    let release = null;
    for (const spec of specs) {
      console.log(`running: ${spec.name}`);
      const r = await runScenario(spec, base, probeDir);
      console.log(`  paid ${r.paid}/${r.users}, full ${r.fullSuccess}/${r.users}, command p50 ${r.commandLatencyMs.p50} ms p90 ${r.commandLatencyMs.p90} ms, sse p50 ${r.sseEventDelayMs.p50} ms, polite ${r.allPolite}, health ${r.healthAfter}`);
      scenarios.push(r);
      if (spec.users === 20 && spec.ips(0) !== spec.ips(1)) {
        // A fresh session from one of the 20 addresses, whose two streams are closed now.
        const created = (await (await fetch(`${base}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.200" },
          body: JSON.stringify({ kioskId: "malo" }),
        })).json()) as { sessionId: string };
        release = await releaseCheck(base, spec.ips(0), created.sessionId);
        console.log(`  stream release: ${release.opened}/10 reopened, 11th ${release.eleventhStatus}`);
      }
    }

    const stderr = [...new Set(server.stderr.map((l) => l.slice(0, 200)))];
    const evidence = {
      what: "Load check of the local production build (standalone server.js as on Cloud Run, STORE=memory, single process): N concurrent /demo users through the HTTP API",
      date: new Date().toISOString(),
      script: "scripts/load-check.ts (npm run load:check)",
      target: "http://127.0.0.1:<free port>, never the deployed service",
      machine: { platform: platform(), cpus: cpus().length, cpuModel: cpus()[0]?.model ?? null, memoryGb: Math.round(totalmem() / 1024 ** 3), node: process.version },
      flowPerUser: [
        "POST /api/session (demo)",
        "2 × GET /api/session/{id}/events (kiosk and phone streams, held until every user of the scenario is done)",
        "2 × POST /api/ping",
        "setDineOption (button)",
        "N = 5: 1 × POST /api/chat with the hero sentence (real Gemini, GEMINI_TEXT_BACKEND=auto); else 2 × addToCart",
        "updateCart per line with a side (fries L)",
        "requestCheckout, confirmCheckout (button), cardAction (kiosk, the /demo stand-in)",
      ],
      notModelled: "Cloud Run's concurrency 80 per instance and max-instances 3: the local server has no request cap, so held streams never queue here. Firestore latency (memory store). The phone's 30 s ping cadence and EventSource reconnects.",
      serverIdle: idle ? { rssMb: Math.round((idle.rss / 1024 / 1024) * 10) / 10, openHandles: idle.total } : null,
      scenarios,
      streamRelease: release,
      serverStderr: stderr,
      serverExitedDuringRun: server.child.exitCode !== null,
    };
    if (!CHAT) return console.log(JSON.stringify(evidence, null, 2));
    writeFileSync(join(ROOT, "evidence/load-check.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log("wrote evidence/load-check.json");
  } finally {
    stop();
    await sleep(500);
    rmSync(probeDir, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
