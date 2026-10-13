import { expect, test, type Page } from "@playwright/test";
import { buttonWithText, claim, command, kioskRoot, readClaim, storedKioskSession } from "./helpers";

// 12-phone-app:7: a screen with no session change and no input closes its session stream and shows "Paused · Tap
// to continue" (20 min in production, src/lib/client/streamControl.ts). Here the idle time is 3 s, set through the
// E2E-only window value that useSessionStream reads.

const IDLE_MS = 3_000;

test.use({ viewport: { width: 1080, height: 1920 }, locale: "en-US", extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.48" } });

async function shortIdle(page: Page) {
  await page.addInitScript((ms) => {
    (window as { __kiboStreamIdleMs?: number }).__kiboStreamIdleMs = ms;
  }, IDLE_MS);
}

const cheeseSet = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

test("an idle kiosk pauses, resumes on the same screen with the cart, and the tap presses nothing under it", async ({ page, request }) => {
  await shortIdle(page);
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  await readClaim(page);
  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");

  const layer = page.locator("[data-stream-paused]");
  await expect(layer).toBeVisible({ timeout: IDLE_MS + 5_000 });
  await expect(layer).toContainText("일시정지됨 · 화면을 누르면 계속합니다");
  await expect(layer).toContainText("Paused · Tap to continue");
  await expect(layer).toBeFocused();

  // A change while paused does not reach the kiosk: its stream is closed.
  const { sessionId, kioskToken } = await storedKioskSession(page);
  await command(request, kioskToken, { sessionId, type: "addToCart", args: cheeseSet, source: "touch" });
  const cart = page.getByRole("region", { name: "장바구니" });
  // Time for a frame to arrive if the stream were still open.
  await page.waitForTimeout(1_000);
  await expect(cart.getByText(/치즈버거 세트/)).toHaveCount(0);

  // Tap right where the cheeseburger tile lies: the layer takes the whole tap, so no product sheet opens.
  const tile = await buttonWithText(page, "치즈버거").boundingBox();
  expect(tile).not.toBeNull();
  await page.mouse.click(tile!.x + tile!.width / 2, tile!.y + tile!.height / 2);
  await expect(layer).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The reopened stream's first frame is a full snapshot: same screen, and the change made while paused.
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(cart.getByText(/치즈버거 세트/)).toBeVisible();
});

test("an idle phone pauses mid-order and resumes with the cart; a paid order keeps its number in view", async ({ page, request }) => {
  await shortIdle(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  const url = new URL(created.claimUrl);
  const claimed = await claim(request, created.sessionId, url.hash.replace(/^#t=/, ""));
  const { deviceToken } = (await claimed.json()) as { deviceToken: string };
  // The phone holds the token, as after its own claim.
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [`kibo.phone.${created.sessionId}`, deviceToken]);
  const phone = (type: string, args: object, extra: { source: string; utteranceSeq?: number; cartVersion?: number }) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });

  await page.goto(`/assistant?s=${created.sessionId}`);
  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  const layer = page.locator("[data-stream-paused]");
  await expect(layer).toBeVisible({ timeout: IDLE_MS + 5_000 });

  await phone("addToCart", cheeseSet, { source: "voice", utteranceSeq: 1 });
  await layer.click();
  await expect(layer).toBeHidden();
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

  // Paid: nothing more comes through the stream, and the order number must stay readable (J1 "After").
  const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });
  await command(request, created.kioskToken, { sessionId: created.sessionId, type: "cardAction", source: "touch" });
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "done");
  await page.waitForTimeout(IDLE_MS + 1_000);
  await expect(layer).toHaveCount(0);
});
