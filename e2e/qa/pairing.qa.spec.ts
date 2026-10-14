import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command, kioskRoot, readClaim, textLines } from "../helpers";
import { PAIRING, qaState, type Findings } from "./checks";

// UI QA of KIBO's pairing panel (12-phone-app:4; a slim status column since 14-final:1, the QR and code only on the
// kiosk): /kiosk on a landscape screen (a laptop as the kiosk) and /demo "Use my phone instead", each waiting for a
// phone and with one connected (claimed through the API). The checks measure the panel; the scaled kiosk canvas
// beside it is checked at full size by kiosk.qa.spec.ts.

const STRICT = process.env.QA_ALL === "1";
const ITEM = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

test.use({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.45" },
});

async function check(page: Page, info: TestInfo, state: string) {
  const f: Findings = await qaState(page, info, PAIRING, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`/kiosk landscape ${vp.width}x${vp.height}: waiting, then connected`, async ({ page, request }, info) => {
    await page.setViewportSize(vp);
    await page.goto("/kiosk?k=malo");
    const panel = page.locator("[data-pairing-panel]");
    const { url, sessionId, claimToken } = await readClaim(page);
    // One QR, on the kiosk's own screen; the panel only says where to find it (14-final:1).
    await expect(page.locator("img[data-claim-url]")).toHaveCount(1);
    await expect(panel.getByText("Waiting for a phone")).toBeVisible();
    // SHORT_APP_URL is set on the QA server: the short host on one line (I-167); the claim URL keeps this server.
    await expect(panel.locator("[data-panel-pair-url]")).toHaveText("kibo-2026.web.app");
    expect(await textLines(panel.locator("[data-panel-pair-url]"))).toBe(1);
    expect(new URL(url).origin).toBe("http://localhost:3200");
    await check(page, info, "kiosk-pairing-waiting");

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    await command(request, deviceToken, { sessionId, type: "addToCart", args: ITEM, source: "voice", utteranceSeq: 1 });
    await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item/);
    await check(page, info, "kiosk-pairing-connected");

    // The user confirms on the phone; the Korean kiosk asks for the card and the panel says so in English (14-final:0).
    await command(request, deviceToken, { sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    const review = await command(request, deviceToken, { sessionId, type: "requestCheckout", args: {}, source: "voice", utteranceSeq: 2 });
    await command(request, deviceToken, { sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: review.cartVersion });
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
    await expect(panel.locator("[data-panel-change]")).toHaveText("Confirmed by you");
    await expect(panel.locator("[data-kiosk-step]")).toContainText("Tap 카드 (Card), then 카드 넣기 (Insert card)");
    await check(page, info, "kiosk-pairing-paying");
  });
}

test("/demo Use my phone instead 1440x900: waiting, then connected", async ({ page, request }, info) => {
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Use my phone instead" }).click();
  const panel = page.locator("[data-pairing-panel]");
  const { sessionId, claimToken } = await readClaim(page);
  await expect(panel.getByText("Waiting for a phone")).toBeVisible();
  await check(page, info, "demo-D2-own-phone-waiting");

  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  await command(request, deviceToken, { sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
  await command(request, deviceToken, { sessionId, type: "addToCart", args: ITEM, source: "voice", utteranceSeq: 1 });
  await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item/);
  await check(page, info, "demo-D2-own-phone-connected");
});
