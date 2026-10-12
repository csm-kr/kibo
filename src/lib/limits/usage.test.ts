import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { Loaded } from "@/lib/store/firestore";
import { FirestoreUsageStore, kstDay, MemoryUsageStore } from "./usage";

describe("kstDay", () => {
  it("uses the Korean date", () => {
    expect(kstDay(Date.UTC(2026, 9, 12, 14, 59))).toBe("2026-10-12");
    expect(kstDay(Date.UTC(2026, 9, 12, 15, 0))).toBe("2026-10-13");
  });
});

describe("MemoryUsageStore", () => {
  it("counts per key and field up to the limit", async () => {
    const usage = new MemoryUsageStore();
    expect(await usage.bump("2026-10-13", "chatMessages", 2)).toBe(true);
    expect(await usage.bump("2026-10-13", "chatMessages", 2)).toBe(true);
    expect(await usage.bump("2026-10-13", "chatMessages", 2)).toBe(false);
    expect(await usage.bump("2026-10-13", "voiceSessions", 2)).toBe(true);
    expect(await usage.bump("2026-10-14", "chatMessages", 2)).toBe(true);
  });
});

/** A one-document Firestore fake: runTransaction runs fn once against `doc`. */
function fakeDb(doc: Record<string, number>) {
  const writes: unknown[] = [];
  const tx = {
    get: async () => ({ get: (f: string) => doc[f] }),
    set: (_ref: unknown, data: unknown, opts: unknown) => writes.push({ data, opts }),
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Firestore;
  const fs = { FieldValue: { increment: (n: number) => ({ increment: n }) } } as unknown as Loaded["fs"];
  return { loaded: { db, fs }, writes };
}

describe("FirestoreUsageStore", () => {
  it("increments inside a transaction below the limit", async () => {
    const { loaded, writes } = fakeDb({ chatMessages: 1 });
    expect(await new FirestoreUsageStore(async () => loaded).bump("2026-10-13", "chatMessages", 2)).toBe(true);
    expect(writes).toEqual([{ data: { chatMessages: { increment: 1 } }, opts: { merge: true } }]);
  });

  it("writes nothing at the limit", async () => {
    const { loaded, writes } = fakeDb({ chatMessages: 2 });
    expect(await new FirestoreUsageStore(async () => loaded).bump("2026-10-13", "chatMessages", 2)).toBe(false);
    expect(writes).toEqual([]);
  });
});
