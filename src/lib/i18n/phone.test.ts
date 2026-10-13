import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { itemCount, learnedPayHint, payMethodHint, pt } from "./phone";

const checkout = getKiosk("doughhouse").learned!.checkout;

describe("ticket machine copy (I-116, R-007)", () => {
  it("the cart, the review and the idle question say tickets, not order", () => {
    for (const key of ["cartTitle", "cartEmpty", "confirmTitle", "idleQuestion"] as const) {
      expect(pt(key, "en", "ticket"), key).not.toMatch(/order/i);
      expect(pt(key, "ko", "ticket"), key).not.toContain("주문");
    }
    expect(pt("cartTitle", "en", "ticket")).toBe("Your tickets");
    expect(pt("confirmTitle", "en", "ticket")).toBe("Please check your tickets");
  });

  it("food kiosks keep the base wording", () => {
    expect(pt("cartTitle", "en")).toBe("Your order");
    expect(pt("cartTitle", "en", "food")).toBe("Your order");
  });

  it("the ticket placeholder fits beside [Send] (I-133)", () => {
    expect(pt("ticketPlaceholder", "en").length).toBeLessThanOrEqual(30);
  });
});

describe("P5 payment hint (I-118)", () => {
  it("names the kiosk's own Korean card button, glossed in English", () => {
    const en = payMethodHint("en");
    expect(`${en.pre}${en.label}${en.gloss}${en.post}`).toBe("On the kiosk, tap 카드 (Card), then insert your card.");
    const ko = payMethodHint("ko");
    expect(`${ko.pre}${ko.label}${ko.gloss}${ko.post}`).toBe("키오스크에서 '카드'를 누르고 카드를 넣어 주세요.");
  });
});

describe("learned kiosk copy", () => {
  it("tells the user to tap the kiosk's own checkout label and pay there", () => {
    const en = learnedPayHint(checkout, "en");
    expect(`${en.pre}${en.label}${en.gloss}${en.post}`).toBe("Your order is on the kiosk. Tap 주문하기 (Order) on the kiosk and pay there.");
    const ko = learnedPayHint(checkout, "ko");
    expect(`${ko.pre}${ko.label}${ko.gloss}${ko.post}`).toBe("주문이 키오스크에 담겼어요. 키오스크에서 '주문하기' 버튼을 누르고 결제해 주세요.");
  });

  it("pending, slow and mismatch say what happened and what to do", () => {
    expect(pt("bridgePending", "en")).toBe("The kiosk is entering it…");
    expect(pt("bridgeSlow", "en")).toBe("Please check the kiosk screen.");
    expect(pt("bridgeMismatch", "en")).toBe("The kiosk did not take that change. Please check the kiosk screen. Staff is on the way.");
    for (const key of ["bridgePending", "bridgeSlow", "bridgeMismatch"] as const) expect(pt(key, "ko")).not.toBe("");
  });
});

describe("cart item count (phone design)", () => {
  it("says item or items in English and 개 in Korean", () => {
    expect(itemCount(1, "en")).toBe("1 item");
    expect(itemCount(2, "en")).toBe("2 items");
    expect(itemCount(0, "en")).toBe("0 items");
    expect(itemCount(3, "ko")).toBe("3개");
  });
});
