import { expect, test, type Page } from "@playwright/test";
import { buttonWithText, command, kioskRoot } from "./helpers";

// Owner 10-18: "말로만 다 카드결제까지", the kiosk must move with every step of the talk, from the dine question to
// the card. Both kiosks /demo keeps, by the AI's own tool calls (source voice, each a new utterance) and no tap on the
// phone: the yes is spoken, KIBO picks 카드 (Card) on the card-only kiosk, and only the card at the kiosk pays.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (240 a minute).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.14" },
});

interface DemoSession {
  sessionId: string;
  deviceToken: string;
}

async function startDemo(page: Page, kioskId: string): Promise<DemoSession> {
  await page.goto(`/demo?k=${kioskId}`);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen", exact: true }).click({ timeout: 60_000 });
  return (await (await created).json()) as DemoSession;
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");
const step = (page: Page) => page.locator("[data-kiosk-step]");

/** The AI's calls for one session, each in its own utterance, as Gemini Live sends them after each spoken turn. */
function talk(page: Page, s: DemoSession) {
  let seq = 0;
  return (type: string, args: object = {}, extra: { cartVersion?: number } = {}) =>
    command(page.request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq, ...extra });
}

/** "Yes" after the review, then the card: the kiosk opens on its card step by itself, and the card pays. */
async function sayYesThenCard(page: Page, ai: ReturnType<typeof talk>, cartVersion: number) {
  // A spoken yes counts only from a new utterance at least 1.5 s after the review opened (CONFIRM_WAIT_MS).
  await page.waitForTimeout(1600);
  await ai("confirmCheckout", {}, { cartVersion });
  const root = kioskRoot(page);
  await expect(root).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  // KIBO's pick shows on the 카드 tile, then the card step opens with no touch.
  await expect(root.locator("[data-picked]")).toBeVisible();
  await expect(root.getByRole("heading", { name: "카드를 아래 투입구에 넣어 주세요" })).toBeVisible();
  await expect(phoneScreen(page).getByText("KIBO picked 카드 (Card) on the kiosk. Insert your card there.")).toBeVisible();
  await expect(step(page)).toHaveText("Payment: insert your card, 카드 넣기 (Insert card).");
  // Only the card at the kiosk pays: the kiosk's own card slot button.
  await root.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
}

test("burger shop by voice alone: dine, item, review, a spoken yes, the card step, paid", async ({ page }) => {
  const s = await startDemo(page, "malo");
  const root = kioskRoot(page);
  const ai = talk(page, s);
  await expect(root).toHaveAttribute("data-screen", "dine");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");

  await ai("setDineOption", { option: "eat_in" });
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");

  await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });
  await expect(buttonWithText(page.locator("[data-kiosk-canvas]"), "치즈버거")).toHaveClass(/k-ring/);
  await expect(page.getByRole("region", { name: "Your order" }).getByText("Cheeseburger set", { exact: true })).toBeVisible();

  const review = await ai("requestCheckout");
  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirm");
  await expect(step(page)).toHaveText("Order review: nothing is paid until you confirm.");

  await sayYesThenCard(page, ai, review.cartVersion);
});

test("ticket machine by voice alone: tickets, review, a spoken yes, the card step, paid", async ({ page }) => {
  const s = await startDemo(page, "airport_rail");
  const root = kioskRoot(page);
  const ai = talk(page, s);
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");

  await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } });
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(buttonWithText(page.locator("[data-kiosk-canvas]"), "직통열차 시티센터")).toHaveClass(/k-ring/);

  const review = await ai("requestCheckout");
  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirm");
  await expect(step(page)).toHaveText("Ticket review: nothing is paid until you confirm.");

  await sayYesThenCard(page, ai, review.cartVersion);
  await expect(page.getByRole("heading", { name: "Reference number" })).toBeVisible();
});

test("a confirm by touch on the kiosk keeps the kiosk's own method screen", async ({ page }) => {
  const s = await startDemo(page, "malo");
  const root = kioskRoot(page);
  const ai = talk(page, s);
  await ai("setDineOption", { option: "eat_in" });
  await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });
  await ai("requestCheckout");
  await expect(root).toHaveAttribute("data-screen", "review");
  await root.getByRole("button", { name: "결제하기" }).click();
  await expect(root).toHaveAttribute("data-screen", "payment");
  await expect(root.getByRole("heading", { name: "결제 방법을 골라 주세요" })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(root.getByRole("heading", { name: "결제 방법을 골라 주세요" })).toBeVisible();
  await expect(root.locator("[data-picked]")).toHaveCount(0);
});
