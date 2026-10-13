import { describe, expect, it } from "vitest";
import { newSession } from "@/lib/commands/session";
import type { Session } from "@/types/session";
import { MemoryStore } from "./memory";
import type { SessionSecrets } from "./types";

const T0 = Date.UTC(2026, 9, 12, 5, 0);

function seed(): { session: Session; secrets: SessionSecrets } {
  return {
    session: newSession({ sessionId: "s1", kioskId: "malo", demo: false, now: T0 }),
    secrets: { claimTokenHash: "c", claimed: false, deviceTokenHash: null, kioskTokenHash: "k", createdAt: T0, expiresAt: T0 + 1 },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("MemoryStore", () => {
  it("create then get returns a copy", async () => {
    const store = new MemoryStore();
    const { session, secrets } = seed();
    await store.create(session, secrets);
    session.cartVersion = 99;
    const got = await store.get("s1");
    expect(got?.cartVersion).toBe(0);
    got!.cartVersion = 5;
    expect((await store.get("s1"))?.cartVersion).toBe(0);
    expect(await store.get("nope")).toBeNull();
  });

  it("create refuses an existing id", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    await expect(store.create(seed().session, seed().secrets)).rejects.toThrow();
  });

  it("transact writes what fn returns and passes null for a missing session", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    const v = await store.transact("s1", (s, sec) => ({
      session: { ...s!, cartVersion: s!.cartVersion + 1 },
      secrets: { ...sec!, claimed: true },
      value: "done",
    }));
    expect(v).toBe("done");
    expect((await store.get("s1"))?.cartVersion).toBe(1);
    const claimed = await store.transact("s1", (_s, sec) => ({ value: sec!.claimed }));
    expect(claimed).toBe(true);
    expect(await store.transact("nope", (s, sec) => ({ value: [s, sec] }))).toEqual([null, null]);
  });

  it("a throw inside fn aborts and rethrows", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    await expect(
      store.transact("s1", (s) => {
        s!.cartVersion = 7;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await store.get("s1"))?.cartVersion).toBe(0);
  });

  it("transactions on one session run one after another", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    const bump = () => store.transact("s1", (s) => ({ session: { ...s!, cartVersion: s!.cartVersion + 1 }, value: null }));
    await Promise.all([bump(), bump(), bump()]);
    expect((await store.get("s1"))?.cartVersion).toBe(3);
  });

  it("a failed transaction does not block the next one", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    const failed = store.transact("s1", () => {
      throw new Error("x");
    });
    const ok = store.transact("s1", (s) => ({ value: s!.sessionId }));
    await expect(failed).rejects.toThrow();
    expect(await ok).toBe("s1");
  });

  it("subscribe sends the current value first, then each committed write, asynchronously", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    const seen: (number | null)[] = [];
    const off = store.subscribe("s1", (s) => seen.push(s?.cartVersion ?? null));
    expect(seen).toEqual([]);
    await tick();
    expect(seen).toEqual([0]);
    await store.transact("s1", (s) => ({ session: { ...s!, cartVersion: 1 }, value: null }));
    await store.transact("s1", () => ({ value: null }));
    await tick();
    expect(seen).toEqual([0, 1]);
    off();
    await store.transact("s1", (s) => ({ session: { ...s!, cartVersion: 2 }, value: null }));
    await tick();
    expect(seen).toEqual([0, 1]);
  });

  it("failSubscribers calls onError and stops the listener, like a failed Firestore listener", async () => {
    const store = new MemoryStore();
    await store.create(seed().session, seed().secrets);
    const seen: unknown[] = [];
    const errors: unknown[] = [];
    store.subscribe("s1", (s) => seen.push(s?.cartVersion), (e) => errors.push(e));
    await tick();
    const boom = new Error("listen failed");
    store.failSubscribers("s1", boom);
    await tick();
    expect(errors).toEqual([boom]);
    await store.transact("s1", (s) => ({ session: { ...s!, cartVersion: 1 }, value: null }));
    await tick();
    expect(seen).toEqual([0]);
  });

  it("pair codes: a live code cannot be reserved twice, an expired one can; delete only removes its own session's code", async () => {
    const store = new MemoryStore();
    expect(await store.reservePairCode("123456", { sessionId: "s1", expiresAt: T0 + 10 }, T0)).toBe(true);
    expect(await store.reservePairCode("123456", { sessionId: "s2", expiresAt: T0 + 20 }, T0 + 5)).toBe(false);
    expect(await store.getPairCode("123456")).toEqual({ sessionId: "s1", expiresAt: T0 + 10 });
    expect(await store.reservePairCode("123456", { sessionId: "s2", expiresAt: T0 + 20 }, T0 + 10)).toBe(true);
    await store.deletePairCode("123456", "s1");
    expect((await store.getPairCode("123456"))?.sessionId).toBe("s2");
    await store.deletePairCode("123456", "s2");
    expect(await store.getPairCode("123456")).toBeNull();
    expect(store.pairCodeCount()).toBe(0);
  });

  it("subscribe on a missing session sends null", async () => {
    const store = new MemoryStore();
    const seen: unknown[] = [];
    store.subscribe("nope", (s) => seen.push(s));
    await tick();
    expect(seen).toEqual([null]);
  });
});
