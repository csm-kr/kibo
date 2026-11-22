import { describe, expect, it } from "vitest";
import { CATCH_UP_GAP_MS, END, heldBack } from "./heldBack";

// Speech held back while the phone has no connection (I-439).
describe("heldBack", () => {
  it("is empty at first: frames go straight up", () => {
    const back = heldBack();
    expect(back.waiting).toBe(false);
    expect(back.next()).toBeNull();
  });

  it("hands out a released hold in order, then its end signal", () => {
    const back = heldBack();
    expect(back.add("a")).toBe(true);
    expect(back.add("b")).toBe(true);
    expect(back.waiting).toBe(true);
    back.end();
    expect([back.next(), back.next(), back.next(), back.next()]).toEqual(["a", "b", END, null]);
    expect(back.waiting).toBe(false);
  });

  it("a hold still down has no end yet: later frames queue behind the ones waiting", () => {
    const back = heldBack();
    back.add("a");
    expect(back.next()).toBe("a");
    expect(back.next()).toBeNull();
    back.add("b");
    back.end();
    expect([back.next(), back.next()]).toEqual(["b", END]);
  });

  it("keeps two holds apart", () => {
    const back = heldBack();
    back.add("a");
    back.end();
    back.add("b");
    back.end();
    expect([back.next(), back.next(), back.next(), back.next(), back.next()]).toEqual(["a", END, "b", END, null]);
  });

  it("ends nothing when the hold left no frame", () => {
    const back = heldBack();
    back.end();
    expect(back.waiting).toBe(false);
    expect(back.next()).toBeNull();
  });

  it("takes no more than its limit: the frame is refused, and the hold's frames can be dropped whole", () => {
    const back = heldBack(2);
    back.add("old");
    back.end();
    expect(back.add("a")).toBe(true);
    // The limit counts every waiting frame: "old" and "a" fill it.
    expect(back.add("b")).toBe(false);
    back.dropOpen();
    // The earlier, finished hold still goes up whole.
    expect([back.next(), back.next(), back.next()]).toEqual(["old", END, null]);
  });

  it("dropOpen removes only the hold that has not ended (a short tap)", () => {
    const back = heldBack();
    back.add("a");
    back.end();
    back.add("tap");
    back.dropOpen();
    expect([back.next(), back.next(), back.next()]).toEqual(["a", END, null]);
  });

  it("clear forgets everything (the connection that had part of it is gone)", () => {
    const back = heldBack();
    back.add("a");
    back.end();
    back.add("b");
    back.clear();
    expect(back.waiting).toBe(false);
    expect(back.next()).toBeNull();
  });

  it("catches up four times faster than real time", () => {
    // 40 ms frames, one every 10 ms.
    expect(CATCH_UP_GAP_MS).toBe(10);
  });
});
