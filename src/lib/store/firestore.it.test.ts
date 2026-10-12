import { describe, expect, it } from "vitest";
import { claimSession, createSession, runCommand } from "@/lib/session/service";
import type { Session } from "@/types/session";
import { getStore } from "./index";

// Integration test against the real Firestore (project kibo-2026). Run with `npm run test:firestore`.

describe.skipIf(process.env.FIRESTORE_IT !== "1")("FirestoreStore", () => {
  it("create → transact → subscribe sees the change", { timeout: 30_000 }, async () => {
    const store = getStore();
    const now = Date.now();
    const { sessionId, claimToken } = await createSession(store, { kioskId: "malo" }, now);
    try {
      const created = await store.get(sessionId);
      expect(created).toMatchObject({ sessionId, status: "idle", createdAt: now, expiresAt: now + 10 * 60 * 1000 });

      const seen: (Session | null)[] = [];
      const off = store.subscribe(sessionId, (s) => seen.push(s));
      const { deviceToken } = await claimSession(store, { sessionId, claimToken }, now + 1);
      const body = { sessionId, commandId: "it1", type: "addToCart", source: "voice", args: { itemId: "cola" } };
      // Cola has no hours limit, so the real clock is fine.
      const res = await runCommand(store, { body, bearer: deviceToken }, now + 2);
      expect(res.cartVersion).toBe(1);

      const deadline = Date.now() + 15_000;
      while (!seen.some((s) => s?.cartVersion === 1) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      off();
      const last = seen.find((s) => s?.cartVersion === 1)!;
      expect(last.cart[0].itemId).toBe("cola");
      // Nested arrays round-trip through the [{ lines }] encoding.
      expect(last.undoStack).toEqual([[]]);
      expect(JSON.stringify(seen)).not.toContain("Hash");
    } finally {
      // TTL deletes both documents once expiresAt is in the past.
      await store.transact(sessionId, (s, sec) => ({
        session: s ? { ...s, status: "expired", expiresAt: 0 } : undefined,
        secrets: sec ? { ...sec, expiresAt: 0 } : undefined,
        value: null,
      }));
    }
  });
});
