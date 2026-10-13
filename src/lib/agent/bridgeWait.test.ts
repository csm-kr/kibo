import { describe, expect, it } from "vitest";
import { BRIDGE_WAIT_MS, waitForBridge } from "./bridgeWait";

/** A fake clock whose sleep moves time forward. */
function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (sleeps.push(ms), (t += ms)), sleeps };
}

describe("waitForBridge", () => {
  it("returns at once when the replay is already done", async () => {
    const c = clock();
    expect(await waitForBridge(() => true, c.now, c.sleep)).toBe(true);
    expect(c.sleeps).toEqual([]);
  });

  it("polls every 200 ms until the replay is done", async () => {
    const c = clock();
    let checks = 0;
    expect(await waitForBridge(async () => ++checks > 3, c.now, c.sleep)).toBe(true);
    expect(c.sleeps).toEqual([200, 200, 200]);
  });

  it("gives up after 12 s", async () => {
    const c = clock();
    expect(await waitForBridge(() => false, c.now, c.sleep)).toBe(false);
    expect(BRIDGE_WAIT_MS).toBe(12_000);
    expect(c.now()).toBe(12_000);
    expect(c.sleeps).toHaveLength(60);
  });
});
