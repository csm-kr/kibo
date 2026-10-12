import { expect, test, type Page } from "@playwright/test";
import { command } from "./helpers";

// /demo?k=doughhouse (docs/UX.md Flow C with a learned kiosk): the left half is the unchanged pizza kiosk page,
// driven by the bridge; the phone half is the same AssistantPanel. The order ends at the review, because the user
// pays on the kiosk itself. No model calls: the AI's tool calls go through the API with the demo's device token.
// The @live test needs E2E_LIVE=1.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.22" },
});

interface DemoSession {
  sessionId: string;
  kioskToken: string;
  deviceToken: string;
}

async function startLearnedDemo(page: Page): Promise<DemoSession> {
  await page.goto("/demo?k=doughhouse");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Doughhouse Pizza/ })).toHaveAttribute("aria-current", "true");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const json = (await (await created).json()) as DemoSession & { ok: boolean };
  expect(json.ok).toBe(true);
  await expect(page.getByRole("heading", { name: "Kiosk (unchanged third-party screen, learned once by KIBO Learn)" })).toBeVisible();
  return json;
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("learned pizza kiosk on /demo: the bridge enters the order, the phone never offers payment", async ({ page, request }) => {
  const s = await startLearnedDemo(page);
  const kioskPage = page.frameLocator("iframe[data-learned-kiosk]");
  const kioskLines = kioskPage.locator("#cartList li");
  const widget = page.locator("[data-learned-widget]");
  const cart = page.getByRole("region", { name: "Your order" });
  await expect(page.getByRole("button", { name: "A large pepperoni with thin dough and extra bacon" })).toHaveCount(0);

  let seq = 0;
  const ai = (type: string, args: object = {}) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });

  await ai("setDineOption", { option: "eat_in" });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByRole("button", { name: "A large pepperoni with thin dough and extra bacon" })).toBeVisible();

  await ai("addToCart", { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } });
  await expect(kioskLines).toHaveCount(1);
  await expect(kioskLines.nth(0)).toContainText("페퍼로니 (라지, 씬, 베이컨) x1");
  await expect(cart.getByText("Pepperoni", { exact: true })).toBeVisible();
  await expect(page.locator("[data-bridge-notice]")).toHaveCount(0);
  // The last change made a new line, so the server would take an undo.
  await expect(cart.getByRole("button", { name: "Undo" })).toBeEnabled();

  await ai("requestCheckout");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(page.locator("[data-pay-on-kiosk]")).toHaveText("Your order is on the kiosk. Tap 주문하기 (Order) on the kiosk and pay there.");
  await expect(page.getByRole("button", { name: "Yes, pay now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tap the card on the kiosk" })).toHaveCount(0);
  // D3 for a learned kiosk: what happens next, [Try again] and the other kiosk.
  await expect(page.locator("[data-demo-end]")).toContainText("you would now pay on the kiosk itself");
  await expect(page.getByRole("link", { name: "Try MALO BURGER" })).toHaveAttribute("href", "/demo");

  await page.getByRole("button", { name: "Pick more" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");

  // Someone deletes the pizza on the kiosk itself; the next replay finds a different cart. The phone keeps the
  // verified cart, says to check the kiosk and that staff is coming, and shows no kiosk page text.
  await kioskPage.getByRole("button", { name: "삭제" }).click();
  await expect(kioskLines).toHaveCount(0);
  await ai("addToCart", { itemId: "garlic_dip", qty: 1 });
  await expect(widget).toHaveAttribute("data-staff-called", "learned_mismatch");
  await expect(page.locator("[data-bridge-notice]")).toHaveText(
    "The kiosk did not take that change. Please check the kiosk screen. Staff is on the way.",
  );
  await expect(page.getByText("Staff is on the way. Please wait a moment.")).toHaveCount(0);
  await expect(cart.getByText("Pepperoni", { exact: true })).toBeVisible();
  await expect(cart.getByText("Garlic dipping sauce", { exact: true })).toHaveCount(0);
});

test("@live typing a pizza order reaches real Gemini and the kiosk's own cart gets the line", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
  await startLearnedDemo(page);
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(page.locator("[data-learned-widget]")).toHaveAttribute("data-bridge-ok", "true", { timeout: 15_000 });
  await page.getByRole("textbox", { name: "Type your order" }).fill("A large pepperoni with thin dough and extra bacon");
  await page.getByRole("button", { name: "Send" }).click();
  const kioskLines = page.frameLocator("iframe[data-learned-kiosk]").locator("#cartList li");
  await expect(kioskLines.filter({ hasText: "페퍼로니" })).toHaveCount(1, { timeout: 90_000 });
  await expect(kioskLines.filter({ hasText: "페퍼로니" })).toContainText("라지");
});
