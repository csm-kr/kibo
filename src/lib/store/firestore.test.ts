import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { FirestoreStore, type Loaded } from "./firestore";

// Unit tests with an injected loader: no network, no firebase-admin. The real store is in firestore.it.test.ts.

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A db whose single document listener reports `error` instead of a snapshot. */
function failingListenerDb(error: Error, stop: () => void): Loaded {
  const doc = { onSnapshot: (_next: unknown, onError: (e: Error) => void) => (queueMicrotask(() => onError(error)), stop) };
  const db = { collection: () => ({ doc: () => doc }) } as unknown as Firestore;
  return { db, fs: {} as Loaded["fs"] };
}

describe("FirestoreStore", () => {
  it("routes a failed init to onError and retries init on the next call", async () => {
    const boom = new Error("no credentials");
    const connect = vi.fn<() => Promise<Loaded>>().mockRejectedValue(boom);
    const store = new FirestoreStore(connect);
    const onError = vi.fn();
    store.subscribe("s1", () => {}, onError);
    await tick();
    expect(onError).toHaveBeenCalledWith(boom);
    await expect(store.get("s1")).rejects.toBe(boom);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("caches a successful init", async () => {
    const connect = vi.fn<() => Promise<Loaded>>().mockResolvedValue(failingListenerDb(new Error("x"), () => {}));
    const store = new FirestoreStore(connect);
    store.subscribe("s1", () => {}, () => {});
    store.subscribe("s2", () => {}, () => {});
    await tick();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("routes a listener error to onError", async () => {
    const boom = new Error("listen failed");
    const store = new FirestoreStore(async () => failingListenerDb(boom, () => {}));
    const onChange = vi.fn();
    const onError = vi.fn();
    store.subscribe("s1", onChange, onError);
    await tick();
    expect(onError).toHaveBeenCalledWith(boom);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports nothing after unsubscribe", async () => {
    const stop = vi.fn();
    const store = new FirestoreStore(async () => failingListenerDb(new Error("late"), stop));
    const onError = vi.fn();
    const off = store.subscribe("s1", () => {}, onError);
    off();
    await tick();
    expect(onError).not.toHaveBeenCalled();
  });
});
