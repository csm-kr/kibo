import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command, kioskRoot, readClaim, textLines } from "../helpers";
import { DEMO, LEARNED, PAIRING, qaState, type Findings, type Profile } from "./checks";

// UI QA of KIBO's pairing panel (12-phone-app:4; a slim status column since 14-final:1, the QR and code only on the
// kiosk): /kiosk on a landscape screen (a laptop as the kiosk), waiting for a phone and with one connected (claimed
// through the API); and /demo's [Start], where the laptop shows the kiosk alone and the judge's phone orders. Checks
// measure KIBO's parts; the scaled kiosk canvas beside them is checked at full size by kiosk.qa.spec.ts.

const STRICT = process.env.QA_ALL === "1";
const ITEM = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

test.use({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.45" },
});

async function check(page: Page, info: TestInfo, state: string, profile: Profile = PAIRING) {
  const f: Findings = await qaState(page, info, profile, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`/kiosk landscape ${vp.width}x${vp.height}: waiting, then connected`, async ({ page, request, baseURL }, info) => {
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
    expect(new URL(url).origin).toBe(new URL(baseURL ?? "").origin);
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

for (const vp of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`/demo [Start] ${vp.width}x${vp.height}: the kiosk alone, waiting, connected, then the next order`, async ({ page, request }, info) => {
    await page.setViewportSize(vp);
    await page.goto("/demo?k=malo");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const step = page.locator("[data-kiosk-step]");
    const { sessionId, claimToken } = await readClaim(page);
    await expect(step).toHaveText("Start: scan the QR with your phone's camera.");
    await check(page, info, "demo-D2-own-phone-waiting", DEMO);

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
      command(request, deviceToken, { sessionId, type, args, ...extra });
    await phone("setDineOption", { option: "eat_in" }, { source: "button" });
    await phone("addToCart", ITEM, { source: "voice", utteranceSeq: 1 });
    await expect(step).toHaveText("Menu: your order shows at the bottom.");
    await check(page, info, "demo-D2-own-phone-connected", DEMO);

    const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
    await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });
    const root = kioskRoot(page);
    await root.getByRole("button", { name: "카드", exact: true }).click();
    await root.getByRole("button", { name: "카드 넣기" }).click();
    await root.getByRole("button", { name: "출력 안 함" }).click();
    await expect(step).toHaveText("Order number: done, no money was charged.");
    // [Try again] and the other places in view under the kiosk, the kiosk at the size it had from the start.
    await expect(page.locator("[data-demo-next]").getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 });
    await check(page, info, "demo-D3-own-phone-done", DEMO);
  });
}

test("/demo [Start] on the learned pizza kiosk 1280x720: KIBO's panel with the QR and code beside the page", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?k=doughhouse");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const { sessionId, claimToken } = await readClaim(page);
  await expect(page.locator("[data-learned-widget] [data-pair-code]")).toBeInViewport({ ratio: 1 });
  await check(page, info, "demo-D2-own-phone-learned-waiting", LEARNED);
  await claim(request, sessionId, claimToken);
  await expect(page.locator("[data-learned-widget]").getByText("Phone connected")).toBeVisible();
  await check(page, info, "demo-D2-own-phone-learned-connected", LEARNED);
});
