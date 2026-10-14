import { describe, expect, it } from "vitest";
import { CommandError, HTTP_STATUS } from "@/lib/commands/errors";
import { SESSION_TTL_MS } from "@/lib/commands/session";
import { MemoryStore } from "@/lib/store/memory";
import { hashToken } from "@/lib/tokens";
import type { Session } from "@/types/session";
import { bumpSessionCounter, claimSession, createSession, PAIR_CODE_TTL_MS, pairSession, ping, reservePairCode, runCommand } from "./service";

/** 2026-10-12 14:00 KST */
const T0 = Date.UTC(2026, 9, 12, 5, 0);
const SET_ORDER = { itemId: "cheese_burger", variant: "set", selections: { drink: ["cola"] } };

let seq = 0;
function body(sessionId: string, type: string, args: object = {}, extra: Record<string, unknown> = {}) {
  return { sessionId, commandId: `c${++seq}`, type, args, source: "touch", ...extra };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CommandError) return e.code;
    throw e;
  }
  throw new Error("expected a CommandError");
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const store = new MemoryStore();
  const created = await createSession(store, { kioskId: "malo" }, T0);
  return { store, ...created };
}

describe("createSession", () => {
  it("creates an idle session and stores only token hashes", async () => {
    const { store, sessionId, claimToken, kioskToken, deviceToken, expiresAt } = await setup();
    expect(deviceToken).toBeUndefined();
    expect(expiresAt).toBe(T0 + SESSION_TTL_MS);
    const s = await store.get(sessionId);
    expect(s?.status).toBe("idle");
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec }));
    expect(sec).toMatchObject({
      claimTokenHash: hashToken(claimToken),
      kioskTokenHash: hashToken(kioskToken),
      claimed: false,
      deviceTokenHash: null,
      expiresAt,
    });
    expect(JSON.stringify(sec)).not.toContain(claimToken);
    expect(JSON.stringify(sec)).not.toContain(kioskToken);
  });

  it("refuses an unknown kiosk", async () => {
    expect(await code(createSession(new MemoryStore(), { kioskId: "nope" }, T0))).toBe("BAD_REQUEST");
  });

  it("a demo session holds a device token and is connected", async () => {
    const store = new MemoryStore();
    const r = await createSession(store, { kioskId: "malo", demo: true }, T0);
    expect(r.deviceToken).toBeDefined();
    const s = await store.get(r.sessionId);
    expect(s).toMatchObject({ status: "connected", demo: true, phoneConnectedAt: T0 });
    const res = await runCommand(store, { body: body(r.sessionId, "addToCart", SET_ORDER, { source: "voice" }), bearer: r.deviceToken! }, T0 + 1);
    expect(res.cart).toHaveLength(1);
    expect(await code(claimSession(store, { sessionId: r.sessionId, claimToken: r.claimToken }, T0 + 2))).toBe("CONFLICT");
  });

  it("a pairable demo session waits for a real phone: no device token, a QR and a code, still a demo", async () => {
    const store = new MemoryStore();
    const r = await createSession(store, { kioskId: "malo", demo: true, pairPhone: true }, T0);
    expect(r.deviceToken).toBeUndefined();
    expect(r.pairCode).toMatch(/^\d{6}$/);
    expect(await store.get(r.sessionId)).toMatchObject({ status: "idle", demo: true, phoneConnectedAt: null });
    const sec = await store.transact(r.sessionId, (_s, sec) => ({ value: sec }));
    expect(sec).toMatchObject({ claimed: false, deviceTokenHash: null, pairCode: r.pairCode });
    // The judge's phone claims it like any kiosk QR; the session stays a demo one, so the demo limits apply.
    const { deviceToken, session } = await claimSession(store, { sessionId: r.sessionId, claimToken: r.claimToken }, T0 + 1);
    expect(session).toMatchObject({ status: "connected", demo: true });
    const res = await runCommand(store, { body: body(r.sessionId, "addToCart", SET_ORDER, { source: "voice" }), bearer: deviceToken }, T0 + 2);
    expect(res.cart).toHaveLength(1);
  });

  it("a pairable demo session pairs with its code too", async () => {
    const store = new MemoryStore();
    const r = await createSession(store, { kioskId: "malo", demo: true, pairPhone: true }, T0);
    const p = await pairSession(store, { code: r.pairCode! }, T0 + 1);
    expect(p).toMatchObject({ sessionId: r.sessionId, session: { status: "connected", demo: true } });
  });

  it("pairPhone without demo is BAD_REQUEST", async () => {
    expect(await code(createSession(new MemoryStore(), { kioskId: "malo", pairPhone: true }, T0))).toBe("BAD_REQUEST");
  });
});

describe("claimSession", () => {
  it("claims once; a second claim is CONFLICT", async () => {
    const { store, sessionId, claimToken } = await setup();
    const { deviceToken, session } = await claimSession(store, { sessionId, claimToken }, T0 + 1000);
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session).toMatchObject({ status: "connected", phoneConnectedAt: T0 + 1000, phoneSeenAt: T0 + 1000, expiresAt: T0 + 1000 + SESSION_TTL_MS });
    const err = await claimSession(store, { sessionId, claimToken }, T0 + 2000).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Someone else is using this kiosk.");
  });

  it("wrong claim token is UNAUTHORIZED, unknown session NOT_FOUND, expired GONE", async () => {
    const { store, sessionId, claimToken } = await setup();
    expect(await code(claimSession(store, { sessionId, claimToken: "wrong" }, T0))).toBe("UNAUTHORIZED");
    expect(await code(claimSession(store, { sessionId: "nope", claimToken }, T0))).toBe("NOT_FOUND");
    expect(await code(claimSession(store, { sessionId, claimToken }, T0 + SESSION_TTL_MS + 1))).toBe("GONE");
    expect((await store.get(sessionId))?.status).toBe("expired");
  });

  it("a claim during ordering keeps ordering", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0 + 1);
    const { session } = await claimSession(store, { sessionId, claimToken }, T0 + 2);
    expect(session.status).toBe("ordering");
  });
});

describe("runCommand", () => {
  it("no or wrong bearer is UNAUTHORIZED; unknown session NOT_FOUND; bad body BAD_REQUEST", async () => {
    const { store, sessionId } = await setup();
    expect(await code(runCommand(store, { body: body(sessionId, "startTouch"), bearer: null }, T0))).toBe("UNAUTHORIZED");
    expect(await code(runCommand(store, { body: body(sessionId, "startTouch"), bearer: "wrong" }, T0))).toBe("UNAUTHORIZED");
    expect(await code(runCommand(store, { body: body("A".repeat(22), "startTouch"), bearer: "x" }, T0))).toBe("NOT_FOUND");
    expect(await code(runCommand(store, { body: { sessionId }, bearer: "x" }, T0))).toBe("BAD_REQUEST");
  });

  it("the phone cannot send cardAction", async () => {
    const { store, sessionId, claimToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    expect(await code(runCommand(store, { body: body(sessionId, "cardAction", {}, { source: "button" }), bearer: deviceToken }, T0 + 1))).toBe("FORBIDDEN");
  });

  it("a full touch order with the kiosk token reaches paid", async () => {
    const { store, sessionId, kioskToken } = await setup();
    const run = (type: string, args: object = {}, extra: Record<string, unknown> = {}, at = T0 + 1) =>
      runCommand(store, { body: body(sessionId, type, args, extra), bearer: kioskToken }, at);
    await run("startTouch");
    await run("setDineOption", { option: "eat_in" });
    const added = await run("addToCart", SET_ORDER);
    expect(added.result?.lineId).toMatch(/^[a-z0-9_]+$/);
    expect(added.total).toBeGreaterThan(0);
    await run("requestCheckout");
    await run("confirmCheckout", {}, { cartVersion: added.cartVersion });
    const paid = await run("cardAction", {}, {}, T0 + 2);
    expect(paid.status).toBe("paid");
    const s = await store.get(sessionId);
    expect(s?.orderNumber).toBeGreaterThanOrEqual(101);
    expect(s?.orderNumber).toBeLessThanOrEqual(999);
    expect(s?.paidAt).toBe(T0 + 2);
  });

  it("every reply carries the dine option now, so the voice model learns a choice made by a tap (14-final:4)", async () => {
    const { store, sessionId, kioskToken } = await setup();
    const run = (type: string, args: object = {}) => runCommand(store, { body: body(sessionId, type, args), bearer: kioskToken }, T0 + 1);
    expect((await run("startTouch")).dineOption).toBeNull();
    await run("setDineOption", { option: "take_out" });
    expect((await run("addToCart", SET_ORDER)).dineOption).toBe("take_out");
  });

  it("two concurrent addToCart both apply", async () => {
    const { store, sessionId, kioskToken } = await setup();
    await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0);
    await Promise.all([
      runCommand(store, { body: body(sessionId, "addToCart", SET_ORDER), bearer: kioskToken }, T0 + 1),
      runCommand(store, { body: body(sessionId, "addToCart", { itemId: "cola" }), bearer: kioskToken }, T0 + 1),
    ]);
    const s = await store.get(sessionId);
    expect(s?.cartVersion).toBe(2);
    expect(s?.cart.map((l) => l.itemId).sort()).toEqual(["cheese_burger", "cola"]);
  });

  it("the same commandId sent twice at once applies once", async () => {
    const { store, sessionId, kioskToken } = await setup();
    await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0);
    const b = body(sessionId, "addToCart", SET_ORDER);
    const [a, c] = await Promise.all([
      runCommand(store, { body: b, bearer: kioskToken }, T0 + 1),
      runCommand(store, { body: b, bearer: kioskToken }, T0 + 1),
    ]);
    expect([a.duplicate, c.duplicate].filter(Boolean)).toHaveLength(1);
    const s = await store.get(sessionId);
    expect(s?.cartVersion).toBe(1);
    expect(s?.cart[0].qty).toBe(1);
  });

  it("a command after expiry writes expired, then GONE", async () => {
    const { store, sessionId, kioskToken } = await setup();
    expect(await code(runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0 + SESSION_TTL_MS + 1))).toBe("GONE");
    expect((await store.get(sessionId))?.status).toBe("expired");
  });

  it("each accepted command keeps the secrets alive as long as the session", async () => {
    const { store, sessionId, kioskToken } = await setup();
    const r = await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0 + 60_000);
    const sec = await store.transact(sessionId, (s, sec) => ({ value: [s!.expiresAt, sec!.expiresAt] }));
    expect(sec).toEqual([T0 + 60_000 + SESSION_TTL_MS, T0 + 60_000 + SESSION_TTL_MS]);
    expect(r.status).toBe("ordering");
  });

  it("reissueClaim rotates the claim: the old device token stops working, a new claim works", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const old = await claimSession(store, { sessionId, claimToken }, T0);
    const r = await runCommand(store, { body: body(sessionId, "reissueClaim"), bearer: kioskToken }, T0 + 1);
    const newClaim = r.result?.claimToken;
    expect(newClaim).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await store.get(sessionId))?.phoneConnectedAt).toBeNull();
    expect(await code(runCommand(store, { body: body(sessionId, "callStaff", { reasonCode: "stuck" }, { source: "button" }), bearer: old.deviceToken }, T0 + 2))).toBe("UNAUTHORIZED");
    expect(await code(claimSession(store, { sessionId, claimToken }, T0 + 3))).toBe("UNAUTHORIZED");
    const fresh = await claimSession(store, { sessionId, claimToken: newClaim! }, T0 + 4);
    const res = await runCommand(store, { body: body(sessionId, "callStaff", { reasonCode: "stuck" }, { source: "button" }), bearer: fresh.deviceToken }, T0 + 5);
    expect(res.ok).toBe(true);
  });

  it("a retried addToCart returns the first response's lineId and upsell, and applies nothing", async () => {
    const { store, sessionId, kioskToken } = await setup();
    await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0);
    const b = body(sessionId, "addToCart", SET_ORDER);
    const first = await runCommand(store, { body: b, bearer: kioskToken }, T0 + 1);
    expect(first.result?.upsell?.offerItemIds.length).toBeGreaterThan(0);
    await runCommand(store, { body: body(sessionId, "addToCart", { itemId: "cola" }), bearer: kioskToken }, T0 + 2);
    const retry = await runCommand(store, { body: b, bearer: kioskToken }, T0 + 3);
    expect(retry.duplicate).toBe(true);
    expect(retry.result).toEqual(first.result);
    expect(retry.cartVersion).toBe(2);
  });

  it("keeps the results of the last 10 commands in sessionSecrets only", async () => {
    const { store, sessionId, kioskToken } = await setup();
    await runCommand(store, { body: body(sessionId, "startTouch"), bearer: kioskToken }, T0);
    const bodies = Array.from({ length: 12 }, () => body(sessionId, "addToCart", { itemId: "cola" }));
    for (const b of bodies) {
      await runCommand(store, { body: b, bearer: kioskToken }, T0 + 1);
      // Undo has no result, so it is not stored; it keeps the cola under the 10-per-item limit.
      await runCommand(store, { body: body(sessionId, "undoLastChange"), bearer: kioskToken }, T0 + 1);
    }
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec! }));
    expect(sec.recentResults?.map((r) => r.commandId)).toEqual(bodies.slice(-10).map((b) => b.commandId));
    // Older than the last 10 results but still in recentCommandIds: applies nothing, no result.
    const old = await runCommand(store, { body: bodies[0], bearer: kioskToken }, T0 + 2);
    expect(old.duplicate).toBe(true);
    expect(old.result).toEqual({});
    expect(JSON.stringify(await store.get(sessionId))).not.toContain("recentResults");
  });

  it("a retried reissueClaim rotates again and returns a fresh claim token that works", async () => {
    const { store, sessionId, kioskToken } = await setup();
    const b = body(sessionId, "reissueClaim");
    const first = await runCommand(store, { body: b, bearer: kioskToken }, T0 + 1);
    const retry = await runCommand(store, { body: b, bearer: kioskToken }, T0 + 2);
    expect(retry.duplicate).toBe(true);
    const fresh = retry.result?.claimToken;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fresh).not.toBe(first.result?.claimToken);
    expect(await code(claimSession(store, { sessionId, claimToken: first.result!.claimToken! }, T0 + 3))).toBe("UNAUTHORIZED");
    expect((await claimSession(store, { sessionId, claimToken: fresh! }, T0 + 4)).deviceToken).toBeDefined();
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec! }));
    expect(JSON.stringify(sec.recentResults)).not.toContain(fresh);
  });

  it("a retried reissueClaim after payment started rotates nothing", async () => {
    const { store, sessionId, kioskToken } = await setup();
    const run = (b: object, at: number) => runCommand(store, { body: b, bearer: kioskToken }, at);
    const reissue = body(sessionId, "reissueClaim");
    const first = await run(reissue, T0 + 1);
    const { deviceToken } = await claimSession(store, { sessionId, claimToken: first.result!.claimToken! }, T0 + 2);
    await run(body(sessionId, "startTouch"), T0 + 3);
    await run(body(sessionId, "setDineOption", { option: "eat_in" }), T0 + 3);
    const added = await run(body(sessionId, "addToCart", SET_ORDER), T0 + 3);
    await run(body(sessionId, "requestCheckout"), T0 + 4);
    await run(body(sessionId, "confirmCheckout", {}, { cartVersion: added.cartVersion }), T0 + 5);
    const retry = await run(reissue, T0 + 6);
    expect(retry.duplicate).toBe(true);
    expect(retry.result?.claimToken).toBeUndefined();
    const staff = body(sessionId, "callStaff", { reasonCode: "stuck" }, { source: "button" });
    expect((await runCommand(store, { body: staff, bearer: deviceToken }, T0 + 7)).status).toBe("paying");
  });

  it("binds source to the actor: the kiosk sends only touch, the phone never touch", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const staff = (source: string) => body(sessionId, "callStaff", { reasonCode: "stuck" }, { source });
    expect(await code(runCommand(store, { body: staff("voice"), bearer: kioskToken }, T0 + 1))).toBe("BAD_REQUEST");
    expect(await code(runCommand(store, { body: staff("touch"), bearer: deviceToken }, T0 + 1))).toBe("BAD_REQUEST");
    expect((await runCommand(store, { body: staff("touch"), bearer: kioskToken }, T0 + 1)).ok).toBe(true);
    expect((await runCommand(store, { body: staff("text"), bearer: deviceToken }, T0 + 1)).ok).toBe(true);
  });
});

describe("subscribe", () => {
  it("receives the change after runCommand, without any token or hash", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const seen: (Session | null)[] = [];
    store.subscribe(sessionId, (s) => seen.push(s));
    await tick();
    await runCommand(store, { body: body(sessionId, "addToCart", SET_ORDER, { source: "voice" }), bearer: deviceToken }, T0 + 1);
    await runCommand(store, { body: body(sessionId, "reissueClaim"), bearer: kioskToken }, T0 + 2);
    await tick();
    expect(seen.map((s) => s?.cartVersion)).toEqual([0, 1, 1]);
    const text = JSON.stringify(seen);
    for (const secret of [claimToken, kioskToken, deviceToken, hashToken(claimToken), hashToken(kioskToken), hashToken(deviceToken)]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/Hash/);
  });
});

describe("ping", () => {
  it("phone ping sets phoneSeenAt; active extends expiry; returns serverTime", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const idle = await ping(store, { sessionId, bearer: deviceToken, active: false }, T0 + 30_000);
    expect(idle).toEqual({ status: "connected", expiresAt: T0 + SESSION_TTL_MS, serverTime: T0 + 30_000 });
    expect((await store.get(sessionId))).toMatchObject({ phoneSeenAt: T0 + 30_000, lastSeenAt: T0 + 30_000 });
    const active = await ping(store, { sessionId, bearer: kioskToken, active: true }, T0 + 60_000);
    expect(active.expiresAt).toBe(T0 + 60_000 + SESSION_TTL_MS);
    expect((await store.get(sessionId))).toMatchObject({ phoneSeenAt: T0 + 30_000, lastSeenAt: T0 + 60_000 });
  });

  it("the phone's working flag sets and clears phoneWorkingAt; a heartbeat and the kiosk leave it alone", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    expect((await store.get(sessionId))?.phoneWorkingAt ?? null).toBeNull();
    await ping(store, { sessionId, bearer: deviceToken, active: true, working: true }, T0 + 1000);
    expect((await store.get(sessionId))?.phoneWorkingAt).toBe(T0 + 1000);
    await ping(store, { sessionId, bearer: deviceToken, active: false }, T0 + 2000);
    await ping(store, { sessionId, bearer: kioskToken, active: true, working: false }, T0 + 3000);
    expect((await store.get(sessionId))?.phoneWorkingAt).toBe(T0 + 1000);
    await ping(store, { sessionId, bearer: deviceToken, active: true, working: false }, T0 + 4000);
    expect((await store.get(sessionId))?.phoneWorkingAt).toBeNull();
  });

  it("needs an actor token", async () => {
    const { store, sessionId } = await setup();
    expect(await code(ping(store, { sessionId, bearer: null, active: true }, T0))).toBe("UNAUTHORIZED");
    expect(await code(ping(store, { sessionId: "nope", bearer: "x", active: true }, T0))).toBe("NOT_FOUND");
  });
});

describe("bumpSessionCounter", () => {
  it("counts per session in sessionSecrets and refuses at the limit without writing", async () => {
    const { store, sessionId, claimToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const bump = () => bumpSessionCounter(store, { sessionId, bearer: deviceToken, field: "chatCount", limit: 2 }, T0 + 1);
    expect((await bump()).allowed).toBe(true);
    const second = await bump();
    expect(second.allowed).toBe(true);
    expect(second.session.sessionId).toBe(sessionId);
    expect((await bump()).allowed).toBe(false);
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec }));
    expect(sec?.chatCount).toBe(2);
  });

  it("checkOnly runs the same checks and answers allowed without counting (the voice relay counts)", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const check = (bearer: string | null, limit = 1) =>
      bumpSessionCounter(store, { sessionId, bearer, field: "liveTokenCount", limit, checkOnly: true }, T0 + 1);
    expect((await check(deviceToken)).allowed).toBe(true);
    expect((await check(deviceToken)).allowed).toBe(true);
    expect((await check(deviceToken, 0)).allowed).toBe(false);
    expect(await code(check(kioskToken))).toBe("FORBIDDEN");
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec }));
    expect(sec?.liveTokenCount ?? 0).toBe(0);
  });

  it("only the phone may use it; unknown NOT_FOUND, expired GONE", async () => {
    const { store, sessionId, claimToken, kioskToken } = await setup();
    const { deviceToken } = await claimSession(store, { sessionId, claimToken }, T0);
    const input = (bearer: string | null, id = sessionId) => ({ sessionId: id, bearer, field: "chatCount" as const, limit: 60 });
    expect(await code(bumpSessionCounter(store, input(kioskToken), T0))).toBe("FORBIDDEN");
    expect(await code(bumpSessionCounter(store, input(null), T0))).toBe("UNAUTHORIZED");
    expect(await code(bumpSessionCounter(store, input(deviceToken, "nope"), T0))).toBe("NOT_FOUND");
    expect(await code(bumpSessionCounter(store, input(deviceToken), T0 + SESSION_TTL_MS + 1))).toBe("GONE");
    expect((await store.get(sessionId))?.status).toBe("expired");
  });
});

describe("learned kiosk commands", () => {
  const PIZZA = { itemId: "margherita", selections: { size: ["large"], dough: ["thin"] } };

  async function learned() {
    const store = new MemoryStore();
    const created = await createSession(store, { kioskId: "doughhouse" }, T0);
    const { deviceToken } = await claimSession(store, { sessionId: created.sessionId, claimToken: created.claimToken }, T0);
    return { store, deviceToken, ...created };
  }

  it("a phone add answers pending; the bridge's matching report applies it", async () => {
    const { store, sessionId, kioskToken, deviceToken } = await learned();
    const add = body(sessionId, "addToCart", PIZZA, { source: "voice", utteranceSeq: 1 });
    const res = await runCommand(store, { body: add, bearer: deviceToken }, T0 + 1);
    expect(res).toEqual({ ok: true, pending: true, status: "connected", cart: [], total: 0, cartVersion: 0, dineOption: null, result: { pending: true } });

    // A retry of the same command is answered pending again and applies nothing.
    const again = await runCommand(store, { body: add, bearer: deviceToken }, T0 + 2);
    expect(again).toMatchObject({ pending: true, duplicate: true });

    const reportBody = body(sessionId, "bridgeReport", { commandId: add.commandId, ok: true, kioskTotal: 19900, kioskLines: [] });
    const done = await runCommand(store, { body: reportBody, bearer: kioskToken }, T0 + 3);
    expect(done.pending).toBeUndefined();
    expect(done.cart).toHaveLength(1);
    expect(done.total).toBe(19900);
    expect((await store.get(sessionId))?.lastChange?.source).toBe("voice");
  });

  it("bridgeReport with the phone token → FORBIDDEN (403)", async () => {
    const { store, sessionId, deviceToken } = await learned();
    const add = body(sessionId, "addToCart", PIZZA, { source: "voice" });
    await runCommand(store, { body: add, bearer: deviceToken }, T0 + 1);
    const reportBody = body(sessionId, "bridgeReport", { commandId: add.commandId, ok: true, kioskTotal: 19900, kioskLines: [] }, {
      source: "button",
    });
    const err = await runCommand(store, { body: reportBody, bearer: deviceToken }, T0 + 2).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.code).toBe("FORBIDDEN");
    expect(HTTP_STATUS[(err as CommandError).code]).toBe(403);
  });

  it("cardAction on a learned kiosk → CONFLICT", async () => {
    const { store, sessionId, kioskToken } = await learned();
    expect(await code(runCommand(store, { body: body(sessionId, "cardAction"), bearer: kioskToken }, T0 + 1))).toBe("CONFLICT");
  });
});

describe("pairing code", () => {
  const WRONG = "That code doesn't match a kiosk. Check the number on the kiosk screen.";

  it("a kiosk session gets a 6-digit code that points at it; only sessionSecrets and pairCodes hold it", async () => {
    const { store, sessionId, pairCode } = await setup();
    expect(pairCode).toMatch(/^\d{6}$/);
    expect(await store.getPairCode(pairCode!)).toEqual({ sessionId, expiresAt: T0 + PAIR_CODE_TTL_MS });
    expect(JSON.stringify(await store.get(sessionId))).not.toContain(pairCode);
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec }));
    expect(sec?.pairCode).toBe(pairCode);
  });

  it("a demo session (already claimed) gets no code", async () => {
    const store = new MemoryStore();
    const r = await createSession(store, { kioskId: "malo", demo: true }, T0);
    expect(r.pairCode).toBeUndefined();
    expect(store.pairCodeCount()).toBe(0);
  });

  it("pairs like a claim, then the code is gone: a second use is NOT_FOUND", async () => {
    const { store, sessionId, pairCode } = await setup();
    const r = await pairSession(store, { code: pairCode! }, T0 + 1000);
    expect(r.sessionId).toBe(sessionId);
    expect(r.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.session).toMatchObject({ status: "connected", phoneConnectedAt: T0 + 1000 });
    expect(await store.getPairCode(pairCode!)).toBeNull();
    const res = await runCommand(store, { body: body(sessionId, "callStaff", { reasonCode: "stuck" }, { source: "button" }), bearer: r.deviceToken }, T0 + 2000);
    expect(res.ok).toBe(true);
    const err = await pairSession(store, { code: pairCode! }, T0 + 3000).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe(WRONG);
  });

  it("a wrong code is NOT_FOUND with plain words", async () => {
    const { store, pairCode } = await setup();
    const wrong = pairCode === "000000" ? "000001" : "000000";
    const err = await pairSession(store, { code: wrong }, T0).catch((e) => e);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe(WRONG);
  });

  it("after a QR claim the code is CONFLICT; an expired session is GONE", async () => {
    const a = await setup();
    await claimSession(a.store, { sessionId: a.sessionId, claimToken: a.claimToken }, T0 + 1);
    const err = await pairSession(a.store, { code: a.pairCode! }, T0 + 2).catch((e) => e);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Someone else is using this kiosk.");
    const b = await setup();
    expect(await code(pairSession(b.store, { code: b.pairCode! }, T0 + SESSION_TTL_MS + 1))).toBe("GONE");
  });

  it("a code past its own expiry is NOT_FOUND even while the session lives", async () => {
    const { store, sessionId, pairCode } = await setup();
    // A long touch order keeps the session alive past the code's hour.
    await store.transact(sessionId, (s) => ({ session: { ...s!, expiresAt: T0 + 2 * PAIR_CODE_TTL_MS }, value: null }));
    expect(await code(pairSession(store, { code: pairCode! }, T0 + PAIR_CODE_TTL_MS + 1))).toBe("NOT_FOUND");
  });

  it("reissueClaim rotates the code too: the old one is NOT_FOUND, the new one pairs", async () => {
    const { store, sessionId, kioskToken, pairCode } = await setup();
    const first = await pairSession(store, { code: pairCode! }, T0);
    const r = await runCommand(store, { body: body(sessionId, "reissueClaim"), bearer: kioskToken }, T0 + 1);
    const next = r.result?.pairCode;
    expect(next).toMatch(/^\d{6}$/);
    expect(next).not.toBe(pairCode);
    expect(store.pairCodeCount()).toBe(1);
    expect(await code(pairSession(store, { code: pairCode! }, T0 + 2))).toBe("NOT_FOUND");
    const again = await pairSession(store, { code: next! }, T0 + 3);
    expect(again.deviceToken).not.toBe(first.deviceToken);
    // The rotated code is never kept in a stored result.
    const sec = await store.transact(sessionId, (_s, sec) => ({ value: sec }));
    expect(JSON.stringify(sec?.recentResults)).not.toContain(next!);
  });

  it("a refused reissueClaim keeps the old code and leaves no new one behind", async () => {
    const { store, sessionId, kioskToken, pairCode } = await setup();
    await store.transact(sessionId, (s) => ({ session: { ...s!, status: "paying" }, value: null }));
    expect(await code(runCommand(store, { body: body(sessionId, "reissueClaim"), bearer: kioskToken }, T0 + 1))).toBe("CONFLICT");
    expect(store.pairCodeCount()).toBe(1);
    expect((await store.getPairCode(pairCode!))?.sessionId).toBe(sessionId);
  });

  it("reservePairCode draws again when a live code is taken, and gives up after a few tries", async () => {
    const store = new MemoryStore();
    await store.reservePairCode("111111", { sessionId: "other", expiresAt: T0 + 60_000 }, T0);
    const draws = ["111111", "222222"];
    expect(await reservePairCode(store, "mine", T0, () => draws.shift()!)).toBe("222222");
    expect((await store.getPairCode("222222"))?.sessionId).toBe("mine");
    await expect(reservePairCode(store, "mine", T0, () => "111111")).rejects.toThrow();
  });
});
