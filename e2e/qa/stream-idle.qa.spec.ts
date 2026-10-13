import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, kioskRoot, readClaim } from "../helpers";
import { DEMO, KIOSK, PHONE, qaState, type Findings, type Profile } from "./checks";

// UI QA of the "Paused · Tap to continue" layer (12-phone-app:7) over K1, K3, the phone's P3 and /demo D2. The
// checks scan the layer itself; the screen under it is inert. Idle time is 3 s through the E2E-only window value.

const IDLE_MS = 3_000;
const STRICT = process.env.QA_ALL === "1";

test.use({ locale: "en-US", extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.49" } });

const ROOT = "[data-stream-paused]";
// A full-viewport layer over the kiosk, not on the scaled canvas: kiosk sizes in CSS px.
const KIOSK_PAUSED: Profile = { route: KIOSK.route, root: ROOT, minFont: 40, minTarget: 40 };
const PHONE_PAUSED: Profile = { ...PHONE, root: ROOT };
const DEMO_PAUSED: Profile = { ...DEMO, root: ROOT };

async function shortIdle(page: Page) {
  await page.addInitScript((ms) => {
    (window as { __kiboStreamIdleMs?: number }).__kiboStreamIdleMs = ms;
  }, IDLE_MS);
}

async function checkPaused(page: Page, info: TestInfo, p: Profile, state: string) {
  await expect(page.locator(ROOT)).toBeVisible({ timeout: IDLE_MS + 5_000 });
  const f: Findings = await qaState(page, info, p, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

test("kiosk K1 and K3 paused", async ({ page }, info) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await shortIdle(page);
  await page.goto("/kiosk?k=malo");
  await readClaim(page);
  await checkPaused(page, info, KIOSK_PAUSED, "K1-paused");

  await page.locator(ROOT).click();
  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  await checkPaused(page, info, KIOSK_PAUSED, "K3-paused");
});

test("phone P3 paused", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await shortIdle(page);
  const created = (await (await request.post("/api/session", { data: { kioskId: "malo" } })).json()) as {
    sessionId: string;
    claimUrl: string;
  };
  const claimed = await claim(request, created.sessionId, new URL(created.claimUrl).hash.replace(/^#t=/, ""));
  const { deviceToken } = (await claimed.json()) as { deviceToken: string };
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [`kibo.phone.${created.sessionId}`, deviceToken]);
  await page.goto(`/assistant?s=${created.sessionId}`);
  // Through the real start: [Type instead] on the mic hint, then the dine choice.
  const screen = page.locator("[data-phone-screen]");
  const start = page.getByRole("button", { name: "Start", exact: true });
  const typeInstead = page.getByRole("button", { name: "Type instead" });
  await expect(start.or(typeInstead)).toBeVisible();
  if (await start.isVisible()) await start.click();
  await typeInstead.click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screen).toHaveAttribute("data-phone-screen", "talk");
  await checkPaused(page, info, PHONE_PAUSED, "P3-paused");
});

test("/demo D2 paused", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await shortIdle(page);
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator('[data-demo="split"]')).toBeVisible();
  await checkPaused(page, info, DEMO_PAUSED, "D2-paused");
});
