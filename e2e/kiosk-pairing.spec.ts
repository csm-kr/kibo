import { expect, test, type Page } from "@playwright/test";
import { claim, command, kioskRoot, readClaim, storedKioskSession } from "./helpers";

// A laptop as the kiosk and a real phone (12-phone-app:4): on a landscape screen /kiosk shows KIBO's status column
// beside the tall portrait canvas; /demo's [Start] shows the kiosk alone, its QR and code on its own screen.
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

test("/kiosk on a landscape screen: after [출력 안 함] the panel's step line says the order number, as the kiosk shows it (#1 31)", async ({
  page,
  request,
}) => {
  await page.goto("/kiosk?k=malo");
  const panel = page.locator("[data-pairing-panel]");
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });
  await phone("addToCart", ITEM, { source: "voice", utteranceSeq: 1 });
  const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });

  const root = kioskRoot(page);
  await root.getByRole("button", { name: "카드", exact: true }).click();
  await root.getByRole("button", { name: "카드 넣기" }).click();
  // The receipt question first: the line says what comes next.
  await expect(root.getByRole("button", { name: "출력 안 함" })).toBeVisible();
  await expect(panel.locator("[data-kiosk-step]")).toHaveText("Kiosk: receipt question, then the order number.");
  await root.getByRole("button", { name: "출력 안 함" }).click();
  // Then the order number on the kiosk, and the same step in the panel, beside "Paid · order number …" (R-024).
  await expect(panel.locator("[data-panel-order]")).toHaveText(/^Paid · order number \d+$/);
  await expect(panel.locator("[data-kiosk-step]")).toHaveText("Kiosk: order number. The order is done; no money was charged.");
});

test("/kiosk on a portrait screen has no panel", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto("/kiosk?k=malo");
  await readClaim(page);
  await expect(page.locator("[data-pairing-panel]")).toHaveCount(0);
});

test("/demo [Start]: the laptop is only the kiosk; the judge's phone claims a demo session; [Try again] makes a fresh pairable one", async ({
  page,
  request,
}) => {
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("main[data-demo-own-phone]")).toBeVisible();
  // Only the kiosk, as in a store: no phone drawn beside it, no status column, no scenario guide or "What the AI did".
  await expect(page.locator("[data-demo-column]")).toHaveCount(1);
  await expect(page.locator("[data-phone-screen]")).toHaveCount(0);
  await expect(page.locator("[data-pairing-panel]")).toHaveCount(0);
  await expect(page.locator("[data-scenario-guide]")).toHaveCount(0);
  await expect(page.getByText("What the AI did")).toHaveCount(0);
  const step = page.locator("[data-kiosk-step]");
  await expect(step).toHaveText("Start: scan the QR with your phone's camera.");
  const next = page.locator("[data-demo-next]");
  await expect(next.getByRole("button", { name: "Back to the start" })).toBeVisible();
  const { sessionId, claimToken } = await readClaim(page);
  const firstCode = (await kioskRoot(page).locator("[data-pair-code]").getAttribute("data-pair-code")) ?? "";
  await expect(page.locator("img[data-claim-url]")).toHaveCount(1);
  // The token only lives inside the QR picture.
  expect(await page.locator("main[data-demo-own-phone]").innerText()).not.toContain(claimToken);

  const claimed = await claim(request, sessionId, claimToken);
  const { deviceToken } = await claimed.json();
  await expect(step).toHaveText("Eat here or take out: answer on either screen.");

  const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });
  await phone("addToCart", ITEM, { source: "voice", utteranceSeq: 1 });
  await expect(step).toHaveText("Menu: your order shows at the bottom.");
  const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });

  // Paying happens on the kiosk itself, as at a real kiosk; the caption says the Korean kiosk's step in English.
  const root = kioskRoot(page);
  await expect(root).toHaveAttribute("data-screen", "payment");
  await expect(step).toHaveText("Payment: tap 카드 (Card), then 카드 넣기 (Insert card).");
  // No card stand-in: the kiosk's own buttons take the card.
  await expect(page.locator("[data-card-reader]")).toHaveCount(0);
  await root.getByRole("button", { name: "카드", exact: true }).click();
  await root.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  // No touch-vs-talk card: the judge's messages and taps happened on their own phone.
  await expect(page.getByText("Touch vs talk")).toHaveCount(0);
  await expect(next.getByRole("button", { name: "Back to the start" })).toHaveCount(0);
  await expect(next.getByRole("navigation", { name: "Try another place" }).getByRole("link")).toHaveText(["Airport rail"]);

  await next.getByRole("button", { name: "Try again" }).click();
  await expect(step).toHaveText("Start: scan the QR with your phone's camera.");
  await expect(page.locator("main[data-demo-own-phone]")).toBeVisible();
  await expect(kioskRoot(page).locator("[data-pair-code]")).not.toHaveAttribute("data-pair-code", firstCode);
  const fresh = await readClaim(page);
  expect(fresh.sessionId).not.toBe(sessionId);
});

test("/demo [Start] on the learned pizza kiosk: KIBO's panel beside the page shows the whole QR and the code at 1280x720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?k=doughhouse");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const widget = page.locator("[data-learned-widget]");
  await expect(widget.locator("img[data-claim-url]")).toBeInViewport({ ratio: 1 });
  await expect(widget.locator("[data-pair-code]")).toHaveAttribute("data-pair-code", /^\d{6}$/);
  await expect(widget.locator("[data-pair-code]")).toBeInViewport({ ratio: 1 });
  // The caption row says what the page is and where to scan, so the panel does not repeat it.
  await expect(page.locator("[data-kiosk-step]")).toHaveText("Start: scan the QR with your phone's camera.");
  expect(await widget.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await expect(page.locator("[data-demo-column]")).toHaveCount(1);
  await expect(page.locator("[data-scenario-guide]")).toHaveCount(0);
});
