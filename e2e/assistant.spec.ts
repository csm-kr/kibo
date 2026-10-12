import { expect, test, type Page } from "@playwright/test";
import { buttonWithText, command, kioskRoot, readClaim, storedKioskSession, warmPhone } from "./helpers";

// The phone /assistant with the kiosk in a second tab (docs/UX.md Flow A), text mode, no model calls: the AI's
// tool calls are sent through the API with the phone's device token, as /api/chat would.

const PHONE = { viewport: { width: 390, height: 844 }, locale: "en-US", isMobile: true, hasTouch: true };

/** usePhoneSession keeps the device token per session in localStorage. */
async function phoneToken(phone: Page, sessionId: string): Promise<string> {
  await expect.poll(() => phone.evaluate((key) => localStorage.getItem(key), `kibo.phone.${sessionId}`)).not.toBeNull();
  return (await phone.evaluate((key) => localStorage.getItem(key), `kibo.phone.${sessionId}`)) ?? "";
}

test("phone claims the QR, mirrors the cart, confirms and gets the order number", async ({ browser, request }) => {
  await warmPhone(browser, request);
  const kioskCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const kiosk = await kioskCtx.newPage();
  await kiosk.goto("/kiosk?k=malo");
  // This spec runs first, so the dev server may still be compiling (and reloading) the kiosk page.
  await expect(kiosk.locator("img[data-claim-url]")).toBeVisible({ timeout: 30_000 });
  const { url, sessionId } = await readClaim(kiosk);
  const { kioskToken } = await storedKioskSession(kiosk);

  const phoneCtx = await browser.newContext(PHONE);
  const phone = await phoneCtx.newPage();
  await phone.goto(url);
  await expect(phone.getByRole("heading", { name: "Tell your phone, and the kiosk orders for you" })).toBeVisible();
  // The one-use claim token leaves the address bar right after the claim.
  await expect.poll(() => phone.url()).not.toContain("#t=");
  const deviceToken = await phoneToken(phone, sessionId);
  await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "dine");

  await phone.getByRole("button", { name: "Start" }).click();
  // P1, first time in this browser: the microphone hint; typing skips the microphone.
  await expect(phone.getByRole("heading", { name: "Turn on the microphone to talk" })).toBeVisible();
  await phone.getByRole("button", { name: "Type instead" }).click();
  await expect(phone.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await phone.getByRole("button", { name: "Eat here" }).click();
  await expect(phone.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "menu");

  const ai = (type: string, args: object, utteranceSeq: number) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
  const cheeseSet = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

  await ai("addToCart", cheeseSet, 1);
  const cart = phone.getByRole("region", { name: "Your order" });
  await expect(cart.getByText("Cheeseburger set", { exact: true })).toBeVisible();
  await expect(buttonWithText(kiosk, "치즈버거")).toHaveClass(/k-ring/);

  await cart.getByRole("button", { name: "Undo" }).click();
  await expect(cart.getByText("Nothing in your order yet.")).toBeVisible();
  await expect(kiosk.getByText("메뉴를 골라 주세요")).toBeVisible();

  await ai("addToCart", cheeseSet, 2);
  await ai("requestCheckout", {}, 3);
  await expect(phone.getByRole("heading", { name: "Please check your order" })).toBeFocused();
  await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "review");

  await phone.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "payment");
  await expect(phone.getByRole("heading", { name: "Insert your card into the kiosk" })).toBeVisible();

  await command(request, kioskToken, { sessionId, type: "cardAction", source: "touch" });
  await expect(phone.getByRole("heading", { name: "Order number" })).toBeVisible();
  await expect(phone.locator("p.font-display")).toHaveText(/^\d{3}$/);

  // A second phone that scans the same QR.
  const otherCtx = await browser.newContext(PHONE);
  const other = await otherCtx.newPage();
  await other.goto(url);
  await expect(other.getByRole("heading", { name: "Someone else is using this kiosk." })).toBeVisible();

  await Promise.all([kioskCtx.close(), phoneCtx.close(), otherCtx.close()]);
});
