import { describe, expect, it } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { SESSION_TTL_MS } from "@/lib/commands/session";
import { MemoryStore } from "@/lib/store/memory";
import { hashToken } from "@/lib/tokens";
import type { Session } from "@/types/session";
import { claimSession, createSession, ping, runCommand } from "./service";

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
    expect(await code(runCommand(store, { body: body("nope", "startTouch"), bearer: "x" }, T0))).toBe("NOT_FOUND");
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

  it("needs an actor token", async () => {
    const { store, sessionId } = await setup();
    expect(await code(ping(store, { sessionId, bearer: null, active: true }, T0))).toBe("UNAUTHORIZED");
    expect(await code(ping(store, { sessionId: "nope", bearer: "x", active: true }, T0))).toBe("NOT_FOUND");
  });
});
