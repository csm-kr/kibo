import { expect, test, type Page } from "@playwright/test";
import { command, kioskRoot } from "./helpers";

// Small dead ends judges hit in their 3 minutes (14-final:1, docs/plan/judges/ux/REPORT.md fixes 5–8): feedback the
// moment a message is sent, on the phone and on the kiosk; a pay button that takes the tap as soon as the card shows;
// a decline button and prices on choices; the cart within reach on a small phone with larger text; /demo on a phone.
// No model calls: /api/chat is answered by the test, which applies the AI's changes through the API.

// Its own address for the dev server's per-IP limits (R-005).
test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.54" } });

const cheeseSet = (drink: string) => ({ itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } });

async function startDemo(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  const ai = (type: string, args: object, utteranceSeq = 1) =>
    command(request(page), s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq });
  return { ...s, ai };
}

const request = (page: Page) => page.context().request;

test("/demo: Working… at once on the phone, KIBO is working on the kiosk, and [Yes, pay now] takes a tap while the AI still answers", async ({
  page,
}) => {
  const s = await startDemo(page);
  let go = () => {};
  const proceed = new Promise<void>((r) => (go = r));
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/chat", async (route) => {
    await proceed;
    await s.ai("addToCart", cheeseSet("zero_cola"));
    await s.ai("requestCheckout", {});
    // The reply is still on its way while the confirm card already shows.
    await held;
    await route.fulfill({ json: { ok: true, reply: "Please check your order.", status: "confirming", cart: [], total: 0, cartVersion: 2, actions: [] } });
  });

  const phone = page.locator("[data-phone-screen]");
  await page.getByRole("textbox", { name: "Type your order" }).fill("One cheeseburger set with zero cola, and I'll pay");
  await page.getByRole("button", { name: "Send" }).click();
  // The phone says so in the same frame as the send, well within 300 ms.
  await expect(phone.getByRole("status").filter({ hasText: "Working…" })).toBeVisible({ timeout: 300 });
  // The kiosk hears it through the session, before anything on it moves.
  await expect(kioskRoot(page).locator("[data-kibo-working]")).toContainText("KIBO");
  await expect(kioskRoot(page).locator("[data-kibo-working]")).toContainText("Working…");

  go();
  await expect(phone).toHaveAttribute("data-phone-screen", "confirm");
  const pay = page.getByRole("button", { name: "Yes, pay now" });
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(phone).toHaveAttribute("data-phone-screen", "pay");
  release();
  await expect(kioskRoot(page).locator("[data-kibo-working]")).toHaveCount(0);
});

test("/demo: the dessert offer has [No thanks], and choices show their price from menu data", async ({ page }) => {
  const s = await startDemo(page);
  let chats = 0;
  await page.route("**/api/chat", async (route) => {
    chats += 1;
    if (chats === 1) {
      await s.ai("addToCart", cheeseSet("cider"));
      await s.ai("offerChoices", { templateId: "upsell", choices: [{ kind: "item", id: "soft_cone" }, { kind: "item", id: "apple_pie" }] });
    }
    await route.fulfill({ json: { ok: true, reply: chats === 1 ? "Added. Would you like a dessert too?" : "Okay.", status: "ordering", cart: [], total: 0, cartVersion: 1, actions: [] } });
  });
  await page.getByRole("textbox", { name: "Type your order" }).fill("One cheeseburger set with cider");
  await page.getByRole("button", { name: "Send" }).click();

  const offer = page.getByRole("region", { name: "Would you like a dessert too?" });
  await expect(offer.getByRole("button", { name: "Soft cone · ₩1,000" })).toBeVisible();
  await offer.getByRole("button", { name: "No thanks" }).click();
  // The buttons go at once; the AI hears the answer as the user's message.
  await expect(offer).toHaveCount(0);
  await expect(page.locator("[data-phone-screen]")).toContainText("No thanks");
  await expect.poll(() => chats).toBe(2);
});

test("/assistant at 360×800 in Korean with larger text: a cart summary when the card is out of view; a smaller dock while typing", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    locale: "ko-KR",
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.54" },
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("kibo.phone.largeText", "on"));
  const created = (await (await context.request.post("/api/session", { data: { kioskId: "malo" } })).json()) as {
    sessionId: string;
    claimUrl: string;
  };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key), { timeout: 60_000 }).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  const phone = (type: string, args: object) =>
    command(context.request, deviceToken, { sessionId: created.sessionId, type, args, source: "voice", utteranceSeq: 1 });

  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "글자로 입력할게요" }).click();
  const input = page.getByRole("textbox", { name: "주문을 글자로 입력" });
  await expect(input).toBeFocused();
  // Keyboard up: the 88px mic shrinks to 56px; it keeps its name.
  const mic = page.locator("[data-voice-state]");
  await expect(mic).toHaveAttribute("data-compact", "true");
  expect((await mic.boundingBox())?.height).toBeLessThan(70);
  await expect(mic).toHaveAccessibleName(/눌러서 말하기/);
  // The hint fits beside [Send] (I-133).
  const fits = await input.evaluate((el: HTMLInputElement) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText(el.placeholder).width <= el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });
  expect(fits).toBe(true);

  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(mic).not.toHaveAttribute("data-compact", "true");

  // A question with six photo choices pushes the cart card below the fold, as judges saw after a change.
  await phone("addToCart", { itemId: "bulgogi_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });
  await phone("offerChoices", {
    templateId: "pick_item",
    choices: ["cheese_burger", "double_cheese_burger", "classic_burger", "bacon_cheese_burger", "shrimp_burger", "spicy_chicken_burger"].map(
      (id) => ({ kind: "item", id }),
    ),
  });
  await expect(page.getByRole("button", { name: /^치즈버거 · [\d,]+원$/ })).toBeVisible();
  const summary = page.locator("[data-cart-summary]");
  await expect(summary).toHaveText(/^내 주문 1개 · 7,200원$/);
  await summary.click();
  await expect(page.getByText("합계", { exact: true })).toBeInViewport();
  await expect(summary).toHaveCount(0);
  await context.close();
});

test("/demo on a phone says to use a laptop on D1 straight away, without left or right", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(page.locator("[data-demo-narrow-note]")).toContainText("Open this on a laptop to see the kiosk and the phone side by side.");
  await expect(page.getByText("Talk or type on the right.")).toBeHidden();
  await expect(page.getByText("Talk or type to the phone.")).toBeVisible();
});

test("/app: the code field's hint is words, not a code", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(page.getByRole("textbox", { name: "Enter the 6-digit code shown on the kiosk" })).toHaveAttribute("placeholder", "6 digits");
});
