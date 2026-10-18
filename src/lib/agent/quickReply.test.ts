import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { CommandResponse } from "@/lib/session/service";
import type { CartLine } from "@/types/session";
import { inScreensLanguage, introOffer, plainRequest, quickReply, summaryReply, type DoneCall } from "./quickReply";

const malo = getKiosk("malo");
const rail = getKiosk("airport_rail");
const pizza = getKiosk("doughhouse");

function line(lineId: string, itemId: string, extra: Partial<CartLine> = {}): CartLine {
  return { lineId, itemId, variant: "single", qty: 1, selections: {}, unitPrice: 1000, ...extra };
}

const SET_ZERO = line("a1", "cheese_burger", {
  variant: "set",
  selections: { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] },
  unitPrice: 6900,
});
const SET_CIDER = line("b2", "cheese_burger", { variant: "set", selections: { side: ["fries_m"], drink: ["cider"] }, unitPrice: 6900 });

function ok(cart: CartLine[], extra: Partial<CommandResponse> = {}): DoneCall["outcome"] {
  const total = cart.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  return { ok: true, response: { ok: true, status: "ordering", cart, total, cartVersion: 1, ...extra } };
}

function call(name: string, args: unknown, outcome: DoneCall["outcome"], cartBefore: CartLine[] = []): DoneCall {
  return { name, args, outcome, cartBefore };
}

describe("quickReply", () => {
  it("adds: names, options and quantity from menu data, then the total (en and ko)", () => {
    const calls = [
      call("addToCart", { itemId: "cheese_burger" }, ok([SET_ZERO], { result: { lineId: "a1" } })),
      call("addToCart", { itemId: "cheese_burger" }, ok([SET_ZERO, SET_CIDER], { result: { lineId: "b2" } }), [SET_ZERO]),
    ];
    expect(quickReply(malo, "en", calls)).toBe(
      "Added 1 × Cheeseburger set (Fries (M) · Zero cola · No pickles) and 1 × Cheeseburger set (Fries (M) · Cider). Total ₩13,800.",
    );
    expect(quickReply(malo, "ko", calls)).toBe(
      "치즈버거 세트 (감자튀김 M · 제로콜라 · 피클 빼기) 1개, 치즈버거 세트 (감자튀김 M · 사이다) 1개 담았어요. 모두 13,800원이에요.",
    );
  });

  it("updates name the changed lines; remove names the line from the cart before it", () => {
    const large = { ...SET_ZERO, selections: { ...SET_ZERO.selections, side: ["fries_l"] }, unitPrice: 7400 };
    const update = call("updateCart", { lineId: "a1" }, ok([large, SET_CIDER]), [SET_ZERO, SET_CIDER]);
    expect(quickReply(malo, "en", [update])).toBe("Changed to 1 × Cheeseburger set (Fries (L) · Zero cola · No pickles). Total ₩14,300.");
    const remove = call("removeFromCart", { lineId: "b2" }, ok([SET_ZERO]), [SET_ZERO, SET_CIDER]);
    expect(quickReply(malo, "ko", [remove])).toBe("치즈버거 세트 뺐어요. 모두 6,900원이에요.");
    expect(quickReply(malo, "en", [call("undoLastChange", {}, ok([SET_ZERO]))])).toBe("I undid the last change. Total ₩6,900.");
  });

  it("dine option, review and confirm use fixed sentences with data names and phone labels", () => {
    expect(quickReply(malo, "en", [call("setDineOption", { option: "take_out" }, ok([], { dineOption: "take_out" }))])).toBe(
      "Take out, got it.",
    );
    const review = call("requestCheckout", {}, ok([SET_ZERO], { status: "confirming" }));
    expect(quickReply(malo, "en", [review])).toBe(
      "Please check your order. The total is ₩6,900. If it is right, say yes or tap \"Yes, pay now\".",
    );
    expect(quickReply(malo, "ko", [review])).toBe("주문 내역을 확인해 주세요. 모두 6,900원이에요. 맞으면 \"네\"라고 하시거나 \"네, 결제할게요\"를 눌러 주세요.");
    expect(quickReply(malo, "en", [call("confirmCheckout", {}, ok([SET_ZERO], { status: "paying" }))])).toBe(
      "Please insert your card into the kiosk.",
    );
  });

  it("a ticket machine says tickets", () => {
    const adult = line("t1", "express_city_center", { selections: { passenger: ["adult"] }, qty: 2, unitPrice: 10500 });
    const out = quickReply(rail, "ko", [call("addToCart", { itemId: "express_city_center", qty: 2 }, ok([adult], { result: { lineId: "t1" } }))]);
    expect(out).toMatch(/2장 골랐어요\. 모두 21,000원이에요\.$/);
    expect(quickReply(rail, "en", [call("requestCheckout", {}, ok([adult], { status: "confirming" }))])).toMatch(/^Please check your tickets\./);
  });

  it("returns null whenever the model must answer: a failure, a choice, staff, an upsell, a learned kiosk, nothing done", () => {
    const added = call("addToCart", {}, ok([SET_ZERO], { result: { lineId: "a1" } }));
    const failed: DoneCall = { name: "addToCart", args: {}, outcome: { ok: false, error: { code: "NEEDS_CHOICE", message: "x" } }, cartBefore: [] };
    expect(quickReply(malo, "en", [added, failed])).toBeNull();
    expect(quickReply(malo, "en", [added, call("offerChoices", {}, ok([SET_ZERO]))])).toBeNull();
    expect(quickReply(malo, "en", [call("callStaff", {}, ok([]))])).toBeNull();
    expect(quickReply(malo, "en", [call("addToCart", {}, ok([SET_ZERO], { result: { lineId: "a1", upsell: { offerItemIds: ["soft_cone"] } } }))])).toBeNull();
    expect(quickReply(pizza, "en", [added])).toBeNull();
    expect(quickReply(malo, "en", [])).toBeNull();
    // A line the server did not return cannot be named from data, so the model says it.
    expect(quickReply(malo, "en", [call("addToCart", {}, ok([SET_ZERO], { result: { lineId: "zz" } }))])).toBeNull();
  });
});

describe("summaryReply (15-judge-fixes:0)", () => {
  const failed: DoneCall = { name: "addToCart", args: {}, outcome: { ok: false, error: { code: "NEEDS_CHOICE", message: "x" } }, cartBefore: [] };

  it("names only the applied changes, skips failures, and ends with the open question", () => {
    const added = call("addToCart", {}, ok([SET_ZERO], { result: { lineId: "a1" } }));
    const offered = call("offerChoices", {}, ok([SET_ZERO]));
    expect(summaryReply(malo, "en", [added, failed, offered], "Which one would you like?")).toBe(
      "Added 1 × Cheeseburger set (Fries (M) · Zero cola · No pickles). Total ₩6,900. Which one would you like?",
    );
    // An upsell the model never offered is left out rather than invented.
    const upsold = call("addToCart", {}, ok([SET_ZERO], { result: { lineId: "a1", upsell: { offerItemIds: ["soft_cone"] } } }));
    expect(summaryReply(malo, "ko", [upsold], null)).toBe("치즈버거 세트 (감자튀김 M · 제로콜라 · 피클 빼기) 1개 담았어요. 모두 6,900원이에요.");
  });

  it("a staff call, a replay still running, and a learned review get their own fixed sentences", () => {
    expect(summaryReply(malo, "en", [call("callStaff", {}, ok([]))], null)).toBe("I've called staff. Someone will come to help you.");
    const pending = call("addToCart", {}, ok([], { pending: true }));
    expect(summaryReply(pizza, "en", [pending], null)).toBe("The kiosk is entering it now.");
    const review = call("requestCheckout", {}, ok([], { status: "confirming" }));
    const reply = summaryReply(pizza, "en", [review], null)!;
    expect(reply).toContain(`tap ${pizza.learned!.checkout.name.ko} (${pizza.learned!.checkout.name.en}) on the kiosk`);
    expect(reply).not.toMatch(/yes, pay now/i);
  });

  // QA 10-18: the kiosk moves to the asked category; the model normally names its items, this is the fallback.
  it("a shown category is named from menu data; quickReply leaves it to the model", () => {
    const shown = call("showMenu", { category: "drink" }, ok([]));
    expect(summaryReply(malo, "ko", [shown], null)).toBe("키오스크 화면에 음료를 띄웠어요.");
    expect(summaryReply(malo, "en", [shown], null)).toBe("The kiosk shows Drinks now.");
    expect(summaryReply(malo, "ko", [call("showMenu", { category: "burger" }, ok([]))], null)).toBe("키오스크 화면에 버거를 띄웠어요.");
    expect(quickReply(malo, "en", [shown])).toBeNull();
  });

  it("a kiosk screen language is named in the reply's language; quickReply leaves it to the model", () => {
    const en = call("setKioskLanguage", { language: "en" }, ok([]));
    expect(summaryReply(malo, "ko", [en], null)).toBe("키오스크 화면을 영어로 바꿨어요.");
    expect(summaryReply(malo, "en", [en], null)).toBe("The kiosk screen is in English now.");
    expect(summaryReply(malo, "en", [call("setKioskLanguage", { language: "ko" }, ok([]))], null)).toBe("The kiosk screen is in Korean now.");
    expect(quickReply(malo, "en", [en])).toBeNull();
  });

  it("null when nothing was applied and nothing is asked", () => {
    expect(summaryReply(malo, "en", [failed], null)).toBeNull();
    expect(summaryReply(malo, "en", [], null)).toBeNull();
  });
});

describe("introOffer", () => {
  it("what the kiosk sells from its categories, and up to 3 items that can be ordered now", () => {
    const en = introOffer(malo, "en");
    expect(en.line).toBe("Here you can order Burgers, Chicken, Sides, Drinks, Coffee, Desserts and Breakfast.");
    expect(en.choices).toEqual([
      { kind: "item", id: "cheese_burger" },
      { kind: "item", id: "soft_cone" },
      { kind: "item", id: "chicken_nuggets" },
    ]);
    expect(introOffer(malo, "ko").line).toBe("여기서는 버거, 치킨, 사이드, 음료, 커피, 디저트, 아침 메뉴를 주문할 수 있어요.");
    for (const c of introOffer(rail, "en").choices) {
      const item = rail.items.find((i) => i.itemId === c.id)!;
      expect(item.soldOut).toBe(false);
      expect(item.availableHours).toBeNull();
    }
    expect(introOffer(rail, "en").line).toBe("This machine sells Express, All-stop and Cards and passes.");
  });
});

describe("inScreensLanguage", () => {
  it("questions too, but only in the screens' language", () => {
    expect(inScreensLanguage("Add a cola. Is it halal?", "en")).toBe(true);
    expect(inScreensLanguage("콜라 하나 주시고 칼로리는 얼마예요", "ko")).toBe(true);
    expect(inScreensLanguage("Un coca, s'il vous plaît.", "en")).toBe(false);
    expect(inScreensLanguage("一杯可乐", "en")).toBe(false);
    expect(inScreensLanguage("One cola, please.", "ko")).toBe(false);
  });
});

describe("plainRequest", () => {
  it("an order in the screen language, with no question in it", () => {
    expect(plainRequest("Make both fries large.", "en")).toBe(true);
    expect(plainRequest("That's all. I'll pay.", "en")).toBe(true);
    expect(plainRequest("치즈버거 세트 하나, 음료는 콜라로 주세요.", "ko")).toBe(true);
    expect(plainRequest("치즈버거 set 하나, drink는 cola로 please.", "ko")).toBe(true);
  });

  it("not for a question, or a message in another language than the screens", () => {
    expect(plainRequest("Add a cola. Is it halal?", "en")).toBe(false);
    expect(plainRequest("Which burger is the cheapest, add it", "en")).toBe(false);
    expect(plainRequest("콜라 하나 주시고 칼로리는 얼마예요", "ko")).toBe(false);
    expect(plainRequest("살 안 찌는 음료 뭐 있어요", "ko")).toBe(false);
    expect(plainRequest("One cola, please.", "ko")).toBe(false);
    expect(plainRequest("콜라 하나 주세요.", "en")).toBe(false);
    expect(plainRequest("Dua paket cheeseburger, minumannya cola semua.", "en")).toBe(false);
    expect(plainRequest("Una hamburguesa, por favor.", "en")).toBe(false);
    expect(plainRequest("Deux menus cheeseburger, s'il vous plaît.", "en")).toBe(false);
    expect(plainRequest("チーズバーガーのセットを2つ", "en")).toBe(false);
  });
});
