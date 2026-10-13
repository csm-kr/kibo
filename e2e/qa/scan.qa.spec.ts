import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { qaState, type Findings, type Profile } from "./checks";

// UI QA of the in-app QR scanner /app/scan (12-phone-app:3) at the four phone sizes with the 320px reflow check,
// judged by the phone numbers: the camera hint, scanning (the QA browser's fake camera), a QR from another site and
// no camera. The foreign QR comes from a stand-in BarcodeDetector and the missing camera from a refused
// getUserMedia, so every state is the real page; nothing is sent anywhere.

const SCAN: Profile = { route: "/app/scan", root: "main", minFont: 16, minTarget: 56 };

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
  permissions: ["camera"],
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.43" },
});

async function check(page: Page, info: TestInfo, state: string) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, SCAN, state, { reflow: true });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test("/app/scan: camera hint, scanning, then a QR from another site", async ({ page }, info) => {
  await page.addInitScript(() => {
    class StandIn {
      static async getSupportedFormats() {
        return ["qr_code"];
      }
      // Nothing for the first second (plain scanning), then a QR that is not a KIBO kiosk.
      private readonly from = Date.now();
      async detect() {
        return Date.now() - this.from > 1000 && (window as { qaForeign?: boolean }).qaForeign ? [{ rawValue: "https://evil.example/menu" }] : [];
      }
    }
    Object.defineProperty(window, "BarcodeDetector", { value: StandIn });
  });
  await page.goto("/app/scan");
  await expect(page.getByRole("button", { name: "Turn on the camera" })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "P0-scan-hint");

  await page.getByRole("button", { name: "Turn on the camera" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-scan-state", "scanning");
  await check(page, info, "P0-scan-scanning");

  await page.evaluate(() => ((window as { qaForeign?: boolean }).qaForeign = true));
  await expect(page.getByText("This QR is not a KIBO kiosk.")).toBeVisible({ timeout: 10_000 });
  await check(page, info, "P0-scan-foreign");
});

test("/app/scan without a camera: the camera app or a pasted link", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
    });
  });
  await page.goto("/app/scan");
  await page.getByRole("button", { name: "Turn on the camera" }).click({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "The camera isn't available." })).toBeVisible();
  await check(page, info, "P0-scan-unavailable");
  await page.getByLabel("Kiosk link").fill("https://evil.example/menu");
  await page.getByRole("button", { name: "Open" }).click();
  await check(page, info, "P0-scan-unavailable-foreign");
});
