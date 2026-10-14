import { expect, test, type Page } from "@playwright/test";
import { claim, command, kioskRoot, readClaim, storedKioskSession } from "./helpers";

// A laptop as the kiosk and a real phone (12-phone-app:4): on a landscape screen /kiosk shows KIBO's status column
// beside the tall portrait canvas, and /demo "Use my phone instead" shows the same column instead of the phone half.
// The QR and code are only on the kiosk's own screen (14-final:1). The "phone" here is plain HTTP with the device token.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.44" },
});

const ITEM = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

/** The claim token never appears in the panel as text or markup; it is only inside the QR picture. */
async function expectNoToken(page: Page, claimToken: string) {
  const panel = page.locator("[data-pairing-panel]");
  expect(await panel.innerText()).not.toContain(claimToken);
  expect(await panel.evaluate((el) => el.outerHTML)).not.toContain(claimToken);
}

/** One QR and one code, on the kiosk's own screen; KIBO's column only says where to find them (14-final:1). */
async function expectOneQr(page: Page, pairCode: string) {
  const panel = page.locator("[data-pairing-panel]");
  await expect(page.locator("img[data-claim-url]")).toHaveCount(1);
  await expect(panel.locator("img")).toHaveCount(1); // the KIBO mark only
  expect(await panel.innerText()).not.toContain(pairCode.slice(0, 3) + " " + pairCode.slice(3));
  expect(await panel.innerText()).not.toContain(pairCode);
}

test("/kiosk on a landscape screen: the tall kiosk holds the QR and code, the panel the phone's status", async ({ page, request }) => {
  await page.goto("/kiosk?k=malo");
  const panel = page.locator("[data-pairing-panel]");
  const { sessionId, claimToken } = await readClaim(page);
  const stored = await storedKioskSession(page);
  await expect(panel.getByText("Waiting for a phone")).toBeVisible();
  await expect(panel).toContainText("Scan the QR on the kiosk, or open");
  // The kiosk canvas is the hero: as tall as the screen.
  expect((await kioskRoot(page).boundingBox())?.height).toBeGreaterThanOrEqual(850);
  const code = kioskRoot(page).locator("[data-pair-code]");
  const firstCode = (await code.getAttribute("data-pair-code")) ?? "";
  expect(firstCode).toMatch(/^\d{6}$/);
  await expectOneQr(page, firstCode);
  await expectNoToken(page, claimToken);

  const claimed = await claim(request, sessionId, claimToken);
  expect(claimed.status()).toBe(200);
  const { deviceToken } = await claimed.json();
  await expect(panel.getByText(/^Phone connected at \d\d:\d\d$/)).toBeVisible();
  await command(request, deviceToken, { sessionId, type: "addToCart", args: ITEM, source: "voice", utteranceSeq: 1 });
  await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item · ₩[\d,]+$/);
  await expect(panel.getByText("Last change: by the AI")).toBeVisible();

  // [Connect another phone] on the kiosk: the panel waits again, and the kiosk's QR sheet holds the new code.
  await kioskRoot(page).getByRole("button", { name: "다른 휴대폰 연결" }).click();
  await expect(panel.getByText("Waiting for a phone")).toBeVisible();
  const reissued = await storedKioskSession(page);
  expect(reissued.claimUrl).not.toBe(stored.claimUrl);
  await expect(kioskRoot(page).locator("[data-pair-code]")).toHaveAttribute("data-pair-code", reissued.pairCode ?? "");
  expect(reissued.pairCode).not.toBe(firstCode);
  await expectOneQr(page, reissued.pairCode ?? "");
  await expectNoToken(page, new URL(reissued.claimUrl).hash.replace(/^#t=/, ""));
});

test("/kiosk on a portrait screen has no panel", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto("/kiosk?k=malo");
  await readClaim(page);
  await expect(page.locator("[data-pairing-panel]")).toHaveCount(0);
});

test("/demo Use my phone instead: the judge's phone claims a demo session; [Try again] makes a fresh pairable one", async ({
  page,
  request,
}) => {
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Use my phone instead" }).click();
  const panel = page.locator("[data-pairing-panel]");
  await expect(panel.getByText("Waiting for a phone")).toBeVisible();
  // No simulated phone in this mode.
  await expect(page.locator("[data-phone-screen]")).toHaveCount(0);
  const { sessionId, claimToken } = await readClaim(page);
  await expectNoToken(page, claimToken);
  const firstCode = (await kioskRoot(page).locator("[data-pair-code]").getAttribute("data-pair-code")) ?? "";
  await expectOneQr(page, firstCode);

  const claimed = await claim(request, sessionId, claimToken);
  const { deviceToken } = await claimed.json();
  await expect(panel.getByText(/^Phone connected at/)).toBeVisible();

  // The scenario guide stays, but its sentences are text to say on the phone: nothing here sends or plays.
  await page.locator("[data-scenario]").first().click();
  await expect(page.locator("[data-scenario-say]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Play it for me" })).toHaveCount(0);
  await expect(page.getByText("Say or type these on your phone.")).toBeVisible();

  const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });
  await phone("addToCart", ITEM, { source: "voice", utteranceSeq: 1 });
  await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item/);
  const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });

  // Paying happens on the kiosk half, as at a real kiosk; the panel says the Korean kiosk's step in English.
  const root = kioskRoot(page);
  await expect(root).toHaveAttribute("data-screen", "payment");
  await expect(panel.locator("[data-panel-change]")).toHaveText("Confirmed by you");
  await expect(panel.locator("[data-kiosk-step]")).toContainText("Tap 카드 (Card), then 카드 넣기 (Insert card)");
  // The caption's copy is for the phone-half demo; here the panel holds it, once.
  await expect(page.locator("[data-kiosk-step]")).toHaveCount(1);
  await root.getByRole("button", { name: "카드", exact: true }).click();
  await root.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  await expect(panel.locator("[data-panel-order]")).toHaveText(/^Paid · order number \d+$/);
  await expect(panel.locator("[data-panel-change]")).toHaveText("Paid at the kiosk · confirmed by you");
  // No touch-vs-talk card: the judge's messages and taps happened on their own phone.
  await expect(page.getByText("Touch vs talk")).toHaveCount(0);

  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel.getByText("Waiting for a phone")).toBeVisible();
  await expect(page.locator("main[data-demo-own-phone]")).toBeVisible();
  await expect(kioskRoot(page).locator("[data-pair-code]")).not.toHaveAttribute("data-pair-code", firstCode);
  const fresh = await readClaim(page);
  expect(fresh.sessionId).not.toBe(sessionId);
});
