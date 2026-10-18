import { expect, test, type Page } from "@playwright/test";
import { claim, command, readClaim } from "./helpers";

// /demo?k=bunsik (I-405): the bunsik shop kiosk a separate AI agent built and KIBO learned blind in round 4
// (spikes/blind-kiosks/bk9-bunsik), shown unchanged and driven by the bridge with its reviewed skill (skills/bunsik.json).
// No model calls: the AI's tool calls go through the command API with the demo's device token, and the bridge replays
// each one on the real kiosk page. The order ends at the review: the user pays on the kiosk itself. @live needs E2E_LIVE=1.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.150" },
});

interface DemoSession {
  sessionId: string;
  kioskToken: string;
  deviceToken: string;
}

async function openIntro(page: Page) {
  await page.goto("/demo?k=bunsik");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
}

async function startOnScreen(page: Page): Promise<DemoSession> {
  await openIntro(page);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  const json = (await (await created).json()) as DemoSession & { ok: boolean };
  expect(json.ok).toBe(true);
  await expect(page.getByRole("heading", { name: "Kiosk · unchanged, learned by KIBO" })).toBeVisible();
  return json;
}

const kioskPage = (page: Page) => page.frameLocator("iframe[data-learned-kiosk]");
const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("/demo?k=bunsik adds the bunsik shop's card after the two offered places, selected, and its tab (I-405, I-414, I-426)", async ({ page }) => {
  await openIntro(page);
  const cards = page.locator("[data-place-card]");
  await expect(cards).toHaveCount(3);
  const card = cards.nth(2);
  await expect(card).toContainText("Bunsik shop");
  await expect(card).toContainText("Boribyeol Bunsik");
  await expect(card).toHaveAttribute("href", "/demo?k=bunsik");
  await expect(card).toHaveAttribute("aria-current", "true");
  for (let i = 0; i < 2; i++) await expect(cards.nth(i)).not.toHaveAttribute("aria-current", /.+/);
  // Its picture is its own kiosk's menu, not another place's.
  expect(await card.locator("img").getAttribute("src")).toContain("place-bunsik.webp");
  // The other learned kiosk stays unoffered.
  await expect(page.getByText("Pizza shop")).toHaveCount(0);
  const tabs = page.locator("[data-demo-topbar]").getByRole("navigation", { name: "Places" }).getByRole("link");
  await expect(tabs).toHaveText(["Burger shop", "Airport rail", "Bunsik shop"]);
  const tab = tabs.filter({ hasText: "Bunsik shop" });
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(tab).toHaveAttribute("href", "/demo?k=bunsik");
  // The owner's word for the place is 분식집 / bunsik shop, never "snack bar" (I-414).
  await expect(page.getByText(/snack bar/i)).toHaveCount(0);
});

test("bunsik shop on /demo: the bridge enters a tteokbokki, a set and a gimbap, undoes one, and never reaches payment", async ({ page }) => {
  const s = await startOnScreen(page);
  const kiosk = kioskPage(page);
  const kioskLines = kiosk.locator(".cart-list .ln");
  const widget = page.locator("[data-learned-widget]");
  const cart = page.getByRole("region", { name: "Your order" });
  const request = page.request;

  let seq = 0;
  const ai = (type: string, args: object = {}) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  // Each replay ends with the server's check of the kiosk's own total, which the line beside the page then shows.
  const replayed = async (total: string) => {
    await expect(page.locator("[data-replay-caption]")).toHaveAttribute("data-replay-caption", "ok", { timeout: 15_000 });
    await expect(page.locator("[data-replay-caption]")).toContainText(`kiosk total ${total} ✓ matches`);
    await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  };

  await ai("setDineOption", { option: "eat_in" });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await expect(kiosk.locator(".dine-chip")).toHaveText("매장 식사");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByRole("button", { name: "Cheese tteokbokki, medium spicy, with a boiled egg" })).toBeVisible();

  await ai("addToCart", { itemId: "cheese_tteokbokki", qty: 1, selections: { spice: ["lv3"], tteok_topping: ["boiled_egg"] } });
  await replayed("6,000원");
  await expect(kioskLines).toHaveCount(1);
  await expect(kioskLines.nth(0)).toContainText("치즈 떡볶이");
  await expect(kioskLines.nth(0)).toContainText("3단계 보통맛 / 삶은 계란");
  await expect(cart.getByText("Cheese tteokbokki", { exact: true })).toBeVisible();

  // Holdout h4's set through its three-step popup (떡볶이 › 김밥 › 음료 with 다음), its own recipe.
  await ai("addToCart", {
    itemId: "boribyeol_set",
    qty: 1,
    selections: { set_tteok: ["tteok_rose"], set_spice: ["lv4"], set_gimbap: ["gimbap_tuna"], set_gimbap_cut: ["cut"], set_drink: ["drink_sikhye"] },
  });
  await replayed("18,400원");
  await expect(kioskLines.nth(1)).toContainText("로제 떡볶이(4단계 매운맛) · 참치 김밥(썰어서) · 식혜");

  // One extra roll: the count option, once (I-190), the `+` found by its row ("within").
  await ai("addToCart", { itemId: "tuna_gimbap", qty: 2, selections: { gimbap_cut: ["whole"], gimbap_extra: ["extra_roll"] } });
  await replayed("33,400원");
  await expect(kioskLines.nth(2)).toContainText("통으로 / 김밥 추가 1줄 ×1");
  await expect(kioskLines.nth(2)).toContainText("15,000원");

  // [Undo] on the phone removes the gimbap on the kiosk with its own ✕ and the confirm popup's 삭제.
  await cart.getByRole("button", { name: "Undo" }).click();
  await replayed("18,400원");
  await expect(kioskLines).toHaveCount(2);
  await expect(kiosk.locator(".pop")).toHaveCount(0);
  await expect(cart.getByText("Tuna gimbap", { exact: true })).toHaveCount(0);

  await ai("requestCheckout");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.locator("[data-pay-on-kiosk]")).toHaveText(
    "Your order is on the kiosk. Tap 주문 확인하기 (Review order) on the kiosk and pay there.",
  );
  await expect(page.getByRole("button", { name: "Yes, pay now" })).toHaveCount(0);
  // The kiosk page is still on its menu: KIBO never opened its review, points popup or payment screen.
  await expect(kiosk.locator(".menu")).toHaveCount(1);
  await expect(kiosk.locator(".review, .pay")).toHaveCount(0);
  await expect(page.locator("[data-demo-end]")).toContainText("you would now pay on the kiosk itself");
  const others = page.getByRole("navigation", { name: "Try another place" });
  await expect(others.getByRole("link")).toHaveText(["Burger shop", "Airport rail"]);
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.151" } });

  test("bunsik shop with the judge's own phone ([Start]): KIBO's panel shows the QR and code, and a claimed phone orders on the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openIntro(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("main[data-demo-own-phone]")).toBeVisible();
    const widget = page.locator("[data-learned-widget]");
    await expect(widget.locator("img[data-claim-url]")).toBeInViewport({ ratio: 1 });
    await expect(widget.locator("[data-pair-code]")).toBeInViewport({ ratio: 1 });
    await expect(page.locator("[data-demo-column]")).toHaveCount(1);
    await expect(page.locator("[data-phone-screen]")).toHaveCount(0);
    // The whole kiosk page (to a pixel: it is scaled) and the row under it are on screen.
    const frame = (await page.locator("iframe[data-learned-kiosk]").boundingBox())!;
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.y + frame.height).toBeLessThanOrEqual(720 + 1);
    const next = page.locator("[data-demo-next]");
    await expect(next.getByRole("button", { name: "Back to the start" })).toBeInViewport({ ratio: 1 });

    const { sessionId, claimToken } = await readClaim(page);
    const { deviceToken } = await (await claim(page.request, sessionId, claimToken)).json();
    await expect(widget.getByText("Phone connected")).toBeVisible();
    const phone = (type: string, args: object, extra: { source: string; utteranceSeq?: number }) =>
      command(page.request, deviceToken, { sessionId, type, args, ...extra });
    await phone("setDineOption", { option: "take_out" }, { source: "button" });
    // One change at a time: the server refuses the next while the bridge is still replaying this one.
    await expect(widget).toHaveAttribute("data-bridge-ok", "true", { timeout: 15_000 });
    await phone("addToCart", { itemId: "fried_dumplings", qty: 1 }, { source: "voice", utteranceSeq: 1 });
    await expect(page.locator("[data-replay-caption]")).toHaveAttribute("data-replay-caption", "ok", { timeout: 15_000 });
    await expect(kioskPage(page).locator(".cart-list .ln")).toHaveCount(1);
    await expect(kioskPage(page).locator(".dine-chip")).toHaveText("포장 주문");
    await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
    // The learned order ends at the review: the row offers the next order and the two offered places on one line.
    await expect(next.getByRole("button", { name: "Try again" })).toBeVisible();
    const places = next.getByRole("navigation", { name: "Try another place" }).getByRole("link");
    await expect(places).toHaveText(["Burger shop", "Airport rail"]);
    for (const link of await places.all()) await expect(link).toBeInViewport({ ratio: 1 });
  });
});

test("/learn/bunsik offers the kiosk on /demo from its first screen", async ({ page }) => {
  await page.goto("/learn/bunsik");
  const link = page.locator("[data-learn-try]");
  await expect(link).toHaveAttribute("href", "/demo?k=bunsik", { timeout: 60_000 });
  await link.click();
  await expect(page.locator("[data-place-card][aria-current]")).toContainText("Bunsik shop");
});

test("@live typing a bunsik shop order reaches real Gemini and the kiosk's own cart gets the line", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
  await startOnScreen(page);
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(page.locator("[data-learned-widget]")).toHaveAttribute("data-bridge-ok", "true", { timeout: 15_000 });
  await page.getByRole("textbox", { name: "Type your order" }).fill("Cheese tteokbokki, medium spicy, with a boiled egg");
  await page.getByRole("button", { name: "Send" }).click();
  const line = kioskPage(page).locator(".cart-list .ln").filter({ hasText: "치즈 떡볶이" });
  await expect(line).toHaveCount(1, { timeout: 90_000 });
  await expect(line).toContainText("3단계 보통맛");
});
