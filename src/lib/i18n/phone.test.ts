import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { learnedPayHint, pt } from "./phone";

const checkout = getKiosk("doughhouse").learned!.checkout;

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
