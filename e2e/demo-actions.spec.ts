import { expect, test, type Page } from "@playwright/test";
import { command } from "./helpers";
import { MIXED_ACTIONS } from "./recordedActions";

// /demo "What the AI did" strip (D2). No model calls: /api/chat is answered by the test with a recorded `actions`
// array, the shape the real route returns, and the cart change goes through the API with the demo's device token.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.30" },
});

const strip = (page: Page) => page.locator("[data-action-strip]");
const toggle = (page: Page) => strip(page).getByRole("button", { name: /What the AI did/ });

async function start(page: Page) {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  return (await (await created).json()) as { sessionId: string; deviceToken: string };
}

test("open at 1440 wide: each action in plain words with its tool and code, newest first, never announced", async ({ page, request }) => {
  const s = await start(page);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(strip(page)).toContainText("Gemini decides; the KIBO server checks every action");
  await expect(strip(page)).toContainText("Nothing yet.");
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });

  await page.route("**/api/chat", async (route) => {
    for (const drink of ["zero_cola", "cider"]) {
      await command(request, s.deviceToken, {
        sessionId: s.sessionId,
        type: "addToCart",
        args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } },
        source: "text",
        utteranceSeq: 1,
      });
    }
    await route.fulfill({ json: { ok: true, reply: "Added.", status: "ordering", cart: [], total: 0, cartVersion: 2, actions: MIXED_ACTIONS } });
  });
  await page.getByRole("textbox", { name: "Type your order" }).fill("Two cheeseburger sets");
  await page.getByRole("button", { name: "Send" }).click();

  const rows = strip(page).getByRole("list", { name: "AI actions, newest first" }).getByRole("listitem");
  await expect(rows).toHaveCount(MIXED_ACTIONS.length);
  await expect(rows.first()).toContainText("Called staff");
  await expect(rows.first()).toContainText("callStaff ✓ 30 ms");
  await expect(strip(page).locator('[data-action-code="CONFLICT"]')).toContainText("Tried to pay → you must confirm it yourself");
  await expect(strip(page).locator('[data-action-code="CONFLICT"]')).toContainText("confirmCheckout refused (CONFLICT)");
  await expect(strip(page).locator('[data-action-code="NEEDS_CHOICE"]')).toContainText("Tried to add Cheeseburger set → a choice is needed first");
  await expect(strip(page)).toContainText("Added 1 × Cheeseburger set (Zero cola · No pickles)");
  await expect(strip(page)).toContainText("addToCart ✓ 182 ms");
  await expect(strip(page)).toContainText("Asked which one: Cola, Zero cola, Cider");
  // The cart announcements are the live region; the strip is not one.
  await expect(strip(page).locator("[aria-live], [role=status], [role=alert]")).toHaveCount(0);
  // No session id or token on screen.
  const text = (await strip(page).innerText()) ?? "";
  expect(text).not.toContain(s.sessionId);
  expect(text).not.toContain(s.deviceToken);

  // From 1440 wide the strip sits in the scenario column, not under the phone: it stays through the review and the
  // confirm card keeps the phone's full height (R-009, I-084).
  await expect(page.locator("[data-scenario-guide] [data-action-strip]")).toHaveCount(1);
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "requestCheckout", args: {}, source: "text", utteranceSeq: 2 });
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "confirm");
  await expect(rows).toHaveCount(MIXED_ACTIONS.length);
  await expect(page.getByRole("button", { name: "Yes, pay now" })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Pick more" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  await expect(rows).toHaveCount(MIXED_ACTIONS.length);

  // Collapsed, it shows how many.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(strip(page).locator("[data-action-count]")).toHaveText(String(MIXED_ACTIONS.length));
  await expect(rows).toHaveCount(0);

  // The user's own tap on [Yes, pay now] goes in the list too, so the safety rule shows (D2); the kiosk caption
  // says the Korean kiosk's payment step in English (D1).
  await toggle(page).click();
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "requestCheckout", args: {}, source: "text", utteranceSeq: 3 });
  await expect(page.locator("[data-kiosk-step]")).toHaveText("Kiosk: order review. Nothing is paid until you confirm.");
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(rows.first()).toContainText("You tapped Yes, pay now");
  await expect(rows.first()).toContainText(/confirmCheckout ✓ \d+ ms/);
  await expect(rows.first()).toContainText("Needs your tap or a new 'yes'");
  await expect(page.locator("[data-kiosk-step]")).toHaveText(
    "Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged.",
  );
});

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("collapsed by default below 1440 wide, under the phone", async ({ page }) => {
    await start(page);
    await expect(page.locator("[data-demo-check] [data-action-strip]")).toHaveCount(1);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(strip(page).locator("[data-action-count]")).toHaveCount(0);
    await toggle(page).click();
    await expect(strip(page)).toContainText("Nothing yet.");
  });
});
