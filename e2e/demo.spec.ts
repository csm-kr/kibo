import { expect, test, type Page } from "@playwright/test";
import { buttonWithText, command, kioskRoot } from "./helpers";

// /demo (docs/UX.md Flow C): both halves on one page and one real session. No model calls: the AI's tool calls are
// sent through the API with the demo's device token, as /api/chat would. The @live test needs E2E_LIVE=1.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (240 a minute), which the other specs already use up.
  // Next.js keeps a client's X-Forwarded-For, and the server keys on its last value.
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.10" },
});

interface DemoSession {
  sessionId: string;
  kioskToken: string;
  deviceToken: string;
}

/** Clicks a button that creates a demo session and returns the tokens the page received. */
async function startDemo(page: Page, button: string): Promise<DemoSession> {
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: button, exact: true }).click();
  const json = (await (await created).json()) as DemoSession & { ok: boolean };
  expect(json.ok).toBe(true);
  return json;
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("judge path: intro, order on both halves, confirm, card stand-in, order number, try again", async ({ page, request }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("ol > li")).toHaveCount(3);
  // The kiosk picker under [Start] defaults to MALO BURGER.
  await expect(page.getByRole("link", { name: /MALO BURGER/ })).toHaveAttribute("aria-current", "true");

  const s = await startDemo(page, "Start");
  expect(s.deviceToken).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Kiosk · unchanged" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your phone", exact: true })).toBeVisible();
  // The demo's phone is connected from the start, so both halves ask for the dine option.
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  // The tap counter is for the `/kiosk?…&demo=1` measurement only; nobody taps this kiosk (I-135).
  await expect(page.locator("[data-demo-counter]")).toHaveCount(0);

  const ai = (type: string, args: object, utteranceSeq: number) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq });
  await ai("setDineOption", { option: "eat_in" }, 1);
  await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } }, 1);

  const cart = page.getByRole("region", { name: "Your order" });
  await expect(cart.getByText("Cheeseburger set", { exact: true })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  await expect(buttonWithText(page.locator("[data-kiosk-canvas]"), "치즈버거")).toHaveClass(/k-ring/);
  // [Connect another phone] would void this page's own phone (I-066).
  await expect(page.getByRole("button", { name: "다른 휴대폰 연결" })).toHaveCount(0);

  await ai("requestCheckout", {}, 2);
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");

  // Only the tap on the confirm card moves to payment; the card stand-in then uses the kiosk's own card path.
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  // The phone half only says what to do: no button there pays. The stand-in is drawn under the kiosk (15-judge-fixes:2).
  await expect(phoneScreen(page).getByRole("heading", { name: "Insert your card into the kiosk" })).toBeVisible();
  await expect(phoneScreen(page).getByRole("button", { name: /card|kiosk|pay/i })).toHaveCount(0);
  await page.locator("[data-card-reader]").getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(page.getByText("승인 중…")).toBeVisible();

  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "done");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
  const phoneNumber = (await page.locator("[data-phone-screen] p.font-display").textContent()) ?? "";
  expect(phoneNumber).toMatch(/^\d{3}$/);
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.locator("[data-kiosk-canvas]").getByText(phoneNumber, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open two-device mode" })).toHaveAttribute("href", "/kiosk?k=malo");
  // D3: the two other places.
  const others = page.getByRole("navigation", { name: "Try another place" });
  await expect(others.getByRole("link", { name: "Airport rail" })).toHaveAttribute("href", "/demo?k=airport_rail");
  await expect(others.getByRole("link", { name: "Pizza shop" })).toHaveAttribute("href", "/demo?k=doughhouse");

  const next = await startDemo(page, "Try again");
  expect(next.sessionId).not.toBe(s.sessionId);
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  await expect(page.getByText("Cheeseburger set", { exact: true })).toHaveCount(0);
});

test("@live typing an order reaches real Gemini and fills the cart", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
  await page.goto("/demo");
  await startDemo(page, "Start");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  await page.getByRole("textbox", { name: "Type your order" }).fill("One cheeseburger set with zero cola");
  await page.getByRole("button", { name: "Send" }).click();
  const cart = page.getByRole("region", { name: "Your order" });
  await expect(cart.getByText("Cheeseburger set", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
});
