import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buttonWithText, claim, command, kioskRoot, readClaim } from "../helpers";
import { KIOSK, qaState, type Findings } from "./checks";

// UI QA of the kiosk screens switched mid-order from the phone ("키오스크도 영어로 바꿔줘", setKioskLanguage, I-418):
// the same K3, K6 and K7 a K1 tap reaches, now reached from Korean with lines already in the cart.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.13" },
});

async function check(page: Page, info: TestInfo, state: string) {
  const f: Findings = await qaState(page, info, KIOSK, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
}

test("MALO switched to English by the phone: K3 with a line, K6 review, K7 payment", async ({ page, request }, info) => {
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  let seq = 0;
  const phone = (type: string, args: object = {}, extra: object = {}) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq, ...extra });

  await phone("setDineOption", { option: "eat_in" });
  await phone("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });
  await expect(buttonWithText(page, "치즈버거")).toBeVisible();
  await phone("setKioskLanguage", { language: "en" });
  await expect(root).toHaveAttribute("lang", "en");
  await expect(buttonWithText(page, "Cheeseburger")).toBeVisible();
  await check(page, info, "K3-menu-en-asked");

  const review = await phone("requestCheckout");
  await expect(root).toHaveAttribute("data-screen", "review");
  await check(page, info, "K6-review-en-asked");

  await command(request, deviceToken, { sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: review.cartVersion });
  await expect(root).toHaveAttribute("data-screen", "payment");
  await check(page, info, "K7-payment-en-asked");
});

test("airport rail switched to 日本語 by the phone: K3", async ({ page, request }, info) => {
  await page.goto("/kiosk?k=airport_rail");
  const root = kioskRoot(page);
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  await command(request, deviceToken, { sessionId, type: "setKioskLanguage", args: { language: "ja" }, source: "text" });
  await expect(root).toHaveAttribute("lang", "ja");
  await check(page, info, "K3-rail-menu-ja-asked");
});
