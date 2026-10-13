import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { warmPhone } from "../helpers";
import { qaState, type Findings, type Profile } from "./checks";

// UI QA of the phone app home /app (P0) at the four phone sizes, each with the 320px reflow check, judged by the
// phone numbers. The target checks only measure what is on screen, so the top and the settings card are checked
// separately. The open order behind [Continue my order] is a real session claimed by the phone (R-005: own address).

const APP: Profile = { route: "/app", root: "main", minFont: 16, minTarget: 56 };

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  { width: 320, height: 700 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  locale: "en-US",
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.40" },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function check(page: Page, info: TestInfo, state: string) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const [part, scroll] of [
      ["", () => scrollTo(0, 0)],
      ["-settings", () => document.querySelector("#settings")?.scrollIntoView({ block: "start" })],
    ] as const) {
      await page.evaluate(scroll);
      const f: Findings = await qaState(page, info, APP, `${state}${part}`, { reflow: true });
      expect.soft(f.h, `${state}${part} ${vp.width}x${vp.height}: H failures`).toEqual([]);
      if (STRICT) expect.soft(f.t, `${state}${part} ${vp.width}x${vp.height}: T misses`).toEqual([]);
    }
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test("/app home: first visit, then Korean with larger text and an order to continue", async ({ page, request }, info) => {
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Scan a kiosk" })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "P0-home");

  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const { sessionId, claimUrl } = (await res.json()) as { sessionId: string; claimUrl: string };
  await page.goto(claimUrl);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), `kibo.phone.${sessionId}`)).not.toBeNull();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "start");

  await page.goto("/app");
  await page.getByRole("button", { name: "한국어" }).click();
  await page.getByRole("switch", { name: "큰 글씨" }).click();
  await expect(page.getByRole("link", { name: "하던 주문 이어서 하기" })).toBeVisible();
  await check(page, info, "P0-home-continue-ko-large");
});
