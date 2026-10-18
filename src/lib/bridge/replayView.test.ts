import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { CartLine, PendingBridgeCommand, Session } from "@/types/session";
import {
  MAX_PAGE_H,
  MIN_PAGE_H,
  PAGE_W,
  pageFrame,
  pageSizeOf,
  replayCaption,
  tapLabel,
  tapMarks,
  type ReplayResult,
  type ReplayTap,
} from "./replayView";

const kiosk = getKiosk("doughhouse");

const tap = (n: number, label: string, x: number, y: number): ReplayTap => ({ n, label, x, y, w: 100, h: 60 });

const add: PendingBridgeCommand = {
  commandId: "c2",
  type: "addToCart",
  args: { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } },
  source: "voice",
  at: 0,
};

const pepperoni: CartLine = {
  lineId: "a1",
  itemId: "pepperoni",
  variant: "single",
  qty: 1,
  selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] },
  unitPrice: 23400,
};

const taps = [tap(1, "피자", 40, 250), tap(2, "페퍼로니", 300, 400), tap(3, "라지 (+4,000원)", 200, 700), tap(4, "씬", 200, 800), tap(5, "베이컨 (+1,500원)", 200, 900), tap(6, "장바구니 담기", 300, 1000)];

const done: ReplayResult = { commandId: "c2", change: add, cartBefore: [], taps, ok: true, reported: true, kioskTotal: 23400 };

function session(over: Partial<Session> = {}): Session {
  return {
    status: "ordering",
    cart: [pepperoni],
    total: 23400,
    pendingBridgeCommand: null,
    bridgeStatus: { lastOk: true, at: 5 },
    staffCalled: null,
    ...over,
  } as Session;
}

describe("pageFrame for a page of a fixed size (the bunsik shop's 720×1280 screen, I-405)", () => {
  it("keeps the learner's width and 1120–1600 height for Doughhouse, and the page's own size for the bunsik shop", () => {
    expect(pageSizeOf(kiosk.learned!)).toEqual({ w: PAGE_W, minH: MIN_PAGE_H, maxH: MAX_PAGE_H });
    expect(pageSizeOf(getKiosk("bunsik").learned!)).toEqual({ w: 720, minH: 1280, maxH: 1280 });
  });

  it("lays the page out at its size and scales it to fit the box, centred", () => {
    const size = pageSizeOf(getKiosk("bunsik").learned!);
    const f = pageFrame(500, 700, size);
    expect(f.pageW).toBe(720);
    expect(f.pageH).toBe(1280);
    expect(f.scale).toBeCloseTo(700 / 1280);
    expect(f.left).toBeCloseTo((500 - 720 * f.scale) / 2);
    expect(f.top).toBeCloseTo(0);
    // A target past the page's own right edge is not on the page.
    expect(tapMarks([tap(1, "옆", 700, 100)], f)).toEqual([]);
    expect(tapMarks([tap(1, "담기", 500, 1100)], f)).toHaveLength(1);
  });
});

describe("pageFrame", () => {
  it("lays the page out shorter than the learning viewport so it scales up (≥ 0.8× at a 900 px tall box)", () => {
    const f = pageFrame(1000, 900);
    expect(f.scale).toBeGreaterThanOrEqual(0.8);
    expect(f.pageH).toBeGreaterThanOrEqual(MIN_PAGE_H);
    // The page fills the box's height, centred across.
    expect(f.pageH * f.scale).toBeCloseTo(900);
    expect(f.left).toBeCloseTo((1000 - PAGE_W * f.scale) / 2);
    expect(f.top).toBeCloseTo(0);
  });

  it("a narrow box is bound by width and the page grows taller to fill it, up to the learning viewport", () => {
    const f = pageFrame(540, 700);
    expect(f.scale).toBeCloseTo(0.5);
    expect(f.pageH).toBeCloseTo(1400);
    const tall = pageFrame(540, 2000);
    expect(tall.pageH).toBe(MAX_PAGE_H);
    expect(tall.top).toBeCloseTo((2000 - MAX_PAGE_H * 0.5) / 2);
  });

  it("is zero before the box is measured", () => {
    expect(pageFrame(0, 0).scale).toBe(0);
  });
});

describe("tapMarks", () => {
  it("puts each replayed tap's number at its target's centre in host pixels", () => {
    const frame = { scale: 0.5, left: 10, top: 20, pageH: 1400 };
    expect(tapMarks([tap(1, "피자", 40, 250), tap(2, "페퍼로니", 300, 400)], frame)).toEqual([
      { n: 1, label: "피자", x: 10 + 90 * 0.5, y: 20 + 280 * 0.5 },
      { n: 2, label: "페퍼로니", x: 10 + 350 * 0.5, y: 20 + 430 * 0.5 },
    ]);
  });

  it("draws nothing for a tap whose target was scrolled out of the visible page (the caption still names it)", () => {
    const frame = { scale: 0.5, left: 0, top: 0, pageH: 1200 };
    expect(tapMarks([tap(1, "아래", 100, 1300), tap(2, "옆", 1200, 100)], frame)).toEqual([]);
  });

  it("draws nothing that did not happen: no taps, no marks", () => {
    expect(tapMarks([], { scale: 1, left: 0, top: 0, pageH: 1200 })).toEqual([]);
  });
});

describe("tapLabel", () => {
  it("drops the price the kiosk prints after an option", () => {
    expect(tapLabel("라지 (+4,000원)")).toBe("라지");
    expect(tapLabel("치즈크러스트 (+3,000원)")).toBe("치즈크러스트");
    expect(tapLabel("씬")).toBe("씬");
    expect(tapLabel("  1.25L (+1,300원) ")).toBe("1.25L");
  });
});

describe("replayCaption", () => {
  it("while the bridge replays: says KIBO is tapping, never done", () => {
    const c = replayCaption({ kiosk, session: session({ pendingBridgeCommand: add }), result: null, working: false });
    expect(c?.tone).toBe("busy");
    expect(c?.en).toContain("tapping the kiosk");
  });

  it("while tapping: names the tap on screen now, in plain words", () => {
    const c = replayCaption({
      kiosk,
      session: session({ pendingBridgeCommand: add }),
      result: null,
      working: false,
      live: { commandId: "c2", taps: taps.slice(0, 3) },
    });
    expect(c?.en).toBe("KIBO is tapping the kiosk… tap 3: 라지");
    expect(c?.ko).toBe("KIBO가 키오스크를 누르고 있어요… 3번째: 라지");
    // Taps of another command say nothing about this one.
    const other = replayCaption({ kiosk, session: session({ pendingBridgeCommand: add }), result: null, working: false, live: { commandId: "c1", taps } });
    expect(other?.en).toBe("KIBO is tapping the kiosk…");
  });

  it("the phone waiting for the AI hides an older result instead of showing it as done (I-221)", () => {
    const c = replayCaption({ kiosk, session: session(), result: done, working: true });
    expect(c?.tone).toBe("busy");
    expect(c?.en).toBe("KIBO is working…");
  });

  it("after the server's verdict: what was added, every real tap in order, and the kiosk's own total that matched", () => {
    const c = replayCaption({ kiosk, session: session(), result: done, working: false });
    expect(c?.tone).toBe("ok");
    expect(c?.en).toBe("Added: Pepperoni. KIBO tapped 피자 → 페퍼로니 → 라지 → 씬 → 베이컨 → 장바구니 담기 · 6 taps · kiosk total 23,400원 ✓ matches");
    expect(c?.ko).toBe("담았어요: 페퍼로니 · 6번 눌렀어요 · 키오스크 합계 23,400원 ✓ 일치");
  });

  it("before the verdict reaches this screen: checking, not done", () => {
    // The report was sent, but the session here still shows the command pending.
    const c = replayCaption({ kiosk, session: session({ pendingBridgeCommand: add, bridgeStatus: null }), result: done, working: false });
    expect(c?.tone).toBe("checking");
    expect(c?.en).not.toContain("✓");
  });

  it("says plainly when the kiosk's cart did not match, and that nothing was added", () => {
    const failed: ReplayResult = { ...done, ok: false, kioskTotal: 500 };
    const c = replayCaption({
      kiosk,
      session: session({ bridgeStatus: { lastOk: false, at: 6 }, staffCalled: { reasonCode: "learned_mismatch", at: 6 } }),
      result: failed,
      working: false,
    });
    expect(c?.tone).toBe("fail");
    expect(c?.en).toContain("Please check the screen");
    expect(c?.en).toContain("nothing was added");
    expect(c?.en).not.toContain("✓");
  });

  it("a server that refused the total wins over the bridge's own check", () => {
    const c = replayCaption({ kiosk, session: session({ bridgeStatus: { lastOk: false, at: 6 } }), result: done, working: false });
    expect(c?.tone).toBe("fail");
  });

  it("a report that never reached KIBO is not called done", () => {
    const c = replayCaption({ kiosk, session: session({ bridgeStatus: null }), result: { ...done, reported: false }, working: false });
    expect(c?.tone).toBe("fail");
    expect(c?.en).toContain("could not confirm");
  });

  it("names a removal from the cart before it and the dine option, and says checked when the kiosk shows no total", () => {
    const remove: PendingBridgeCommand = { commandId: "c3", type: "removeFromCart", args: { lineId: "a1" }, lineIndex: 0, source: "voice", at: 0 };
    const r = replayCaption({
      kiosk,
      session: session({ cart: [], total: 0 }),
      result: { ...done, commandId: "c3", change: remove, cartBefore: [pepperoni], taps: [tap(1, "삭제", 600, 1300)], kioskTotal: 0 },
      working: false,
    });
    expect(r?.en).toBe("Removed: Pepperoni. KIBO tapped 삭제 · 1 tap · kiosk total 0원 ✓ matches");
    const dine: PendingBridgeCommand = { commandId: "c1", type: "setDineOption", args: { option: "take_out" }, source: "voice", at: 0 };
    const d = replayCaption({
      kiosk,
      session: session({ cart: [], total: 0 }),
      result: { ...done, commandId: "c1", change: dine, taps: [tap(1, "🛍 가져갈게요", 300, 600)], kioskTotal: null },
      working: false,
    });
    expect(d?.en).toBe("Take out. KIBO tapped 🛍 가져갈게요 · 1 tap · kiosk cart checked ✓");
    expect(d?.ko).toBe("포장 · 1번 눌렀어요 · 키오스크 장바구니 확인 ✓");
  });

  it("without a replay of its own (the page reloaded), only a failure is shown; never a stale done", () => {
    expect(replayCaption({ kiosk, session: session(), result: null, working: false })).toBeNull();
    const f = replayCaption({ kiosk, session: session({ bridgeStatus: { lastOk: false, at: 1 } }), result: null, working: false });
    expect(f?.tone).toBe("fail");
  });
});
