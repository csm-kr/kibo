import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { command, warmPhone } from "../helpers";
import { PHONE, qaState, type Findings } from "./checks";

// UI QA of the phone on a learned kiosk (docs/UX.md P2–P4, PX "Please check the kiosk screen"). No kiosk page is
// open, so no bridge answers: a change stays pending until this test sends the bridge's report with the kiosk token,
// which is what the bridge would send. No model calls.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  { width: 320, height: 700 },
];
/** The pending line lasts 15 s, so it is measured at the main and the reflow width only. */
const PENDING_VIEWPORTS = [VIEWPORTS[0], VIEWPORTS[3]];
const GARLIC_DIP = 500;

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  locale: "en-US",
  isMobile: true,
  hasTouch: true,
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.23" },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function check(page: Page, info: TestInfo, state: string, viewports = VIEWPORTS) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, PHONE, state, { reflow: true });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const screenOf = (page: Page) => page.locator("[data-phone-screen]");
const notice = (page: Page) => page.locator("[data-bridge-notice]");

async function openLearnedPhone(page: Page, request: APIRequestContext) {
  const res = await request.post("/api/session", { data: { kioskId: "doughhouse" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  let seq = 0;
  /** A phone command with a known id, so the test can answer it as the bridge. */
  async function phone(type: string, args: object = {}) {
    const commandId = randomUUID();
    const r = await request.post("/api/command", {
      headers: { Authorization: `Bearer ${deviceToken}` },
      data: { sessionId: created.sessionId, commandId, type, args, source: "voice", utteranceSeq: ++seq },
    });
    expect((await r.json()).ok, type).toBe(true);
    return commandId;
  }
  const bridge = (commandId: string, ok: boolean, kioskTotal: number | null) =>
    command(request, created.kioskToken, {
      sessionId: created.sessionId,
      type: "bridgeReport",
      args: { commandId, ok, kioskTotal, kioskLines: [] },
      source: "touch",
    });
  return { ...created, phone, bridge };
}

test("learned kiosk on the phone: entering, check the kiosk, mismatch, pay on the kiosk", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  const s = await openLearnedPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "dine");

  // The dine choice waits for the kiosk; the bridge's report moves the phone on.
  const dine = await s.phone("setDineOption", { option: "eat_in" });
  await expect(notice(page)).toHaveAttribute("data-bridge-notice", "pending");
  await check(page, info, "P2-learned-pending", PENDING_VIEWPORTS);
  await s.bridge(dine, true, 0);
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(notice(page)).toHaveCount(0);

  const waiting = await s.phone("addToCart", { itemId: "garlic_dip", qty: 1 });
  await expect(notice(page)).toHaveText("The kiosk is entering it…");
  await check(page, info, "P3-learned-pending", PENDING_VIEWPORTS);

  // 15 s without a report: check the kiosk screen, with [Call staff].
  await expect(notice(page)).toHaveAttribute("data-bridge-notice", "slow", { timeout: 20_000 });
  await expect(notice(page).getByRole("button", { name: "Call staff" })).toBeVisible();
  await check(page, info, "P3-learned-slow");

  // The kiosk's total did not match (a report after 20 s counts as failed too): nothing applied, staff called.
  await s.bridge(waiting, false, null);
  await expect(notice(page)).toHaveText("The kiosk did not take that change. Please check the kiosk screen. Staff is on the way.");
  await expect(page.getByText("Nothing in your order yet.")).toBeVisible();
  await check(page, info, "P3-learned-mismatch");

  // A verified add, then the review: the user pays on the kiosk, so there is no pay button.
  const add = await s.phone("addToCart", { itemId: "garlic_dip", qty: 1 });
  await s.bridge(add, true, GARLIC_DIP);
  await expect(notice(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your order" }).getByText("Garlic dipping sauce", { exact: true })).toBeVisible();
  await s.phone("requestCheckout");
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.getByRole("button", { name: "Yes, pay now" })).toHaveCount(0);
  await check(page, info, "P4-learned-confirm");
});
