import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type APIRequestContext } from "@playwright/test";
import { kioskRoot, readClaim, warmPhone } from "./helpers";
import { writeQrVideo } from "./qrVideo";

// Pairing from the phone web app (12-phone-app:3): the 6-digit code the kiosk shows, typed on /app, and the kiosk
// QR scanned inside /app/scan. The scanner test launches its own Chromium whose fake camera plays a generated video
// of a real claim URL, so the whole path (camera, decoder, parseKioskQr, claim) runs with no person and no network.

const ADDRESS = "192.0.2.42";

// Its own address (R-005): sessions, claims and pairing attempts.
test.use({
  viewport: { width: 390, height: 844 },
  locale: "en-US",
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { "X-Forwarded-For": ADDRESS },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function newSession(request: APIRequestContext) {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  return (await res.json()) as { sessionId: string; claimUrl: string; pairCode: string };
}

/** 409 once a phone holds the session, 404 for a used or unknown code. */
async function pairStatus(request: APIRequestContext, code: string) {
  return (await request.post("/api/session/pair", { data: { code } })).status();
}

test("only /app/scan may use the camera", async ({ request }) => {
  expect((await request.get("/app/scan")).headers()["permissions-policy"]).toBe("microphone=(self), camera=(self)");
  for (const path of ["/app", "/assistant", "/kiosk"]) {
    expect((await request.get(path)).headers()["permissions-policy"], path).toBe("microphone=(self), camera=()");
  }
});

test("the code on the kiosk, typed on /app, connects the phone; a wrong code says so", async ({ browser, page }) => {
  const kioskContext = await browser.newContext({ viewport: { width: 1080, height: 1920 }, extraHTTPHeaders: { "X-Forwarded-For": ADDRESS } });
  const kiosk = await kioskContext.newPage();
  await kiosk.goto("/kiosk?k=malo");
  const { sessionId } = await readClaim(kiosk);
  const codeEl = kiosk.locator("[data-pair-code]");
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.getAttribute("data-pair-code")) ?? "";
  expect(code).toMatch(/^\d{6}$/);
  await expect(kiosk.getByText("localhost:3100/app")).toBeVisible();

  await page.goto("/app");
  const field = page.getByLabel("Enter the 6-digit code shown on the kiosk");
  await expect(field).toBeVisible({ timeout: 60_000 });
  await field.fill("12");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator("#pair-error")).toHaveText("Please enter all 6 digits.");

  const wrong = code === "000000" ? "000001" : "000000";
  await field.fill(wrong);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator("#pair-error")).toHaveText("That code doesn't match a kiosk. Check the number on the kiosk screen.");

  // Pasted with a space, as a message app would show it.
  await field.fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(field).toHaveValue(code);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(`/assistant?s=${sessionId}`);
  await expect(page.locator("[data-phone-screen]")).not.toHaveAttribute("data-phone-screen", "ended");
  expect(await page.evaluate((k) => localStorage.getItem(k), `kibo.phone.${sessionId}`)).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // The kiosk sees the phone and moves on; the code was single use.
  await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "dine");
  expect(await pairStatus(page.request, code)).toBe(404);
  await kioskContext.close();
});

test("/app/scan reads the kiosk QR from the camera, stops the camera and claims", async ({ request, baseURL }) => {
  const s = await newSession(request);
  const dir = mkdtempSync(join(tmpdir(), "kibo-scan-"));
  const kioskVideo = join(dir, "kiosk.y4m");
  writeQrVideo(kioskVideo, s.claimUrl);
  const foreignVideo = join(dir, "foreign.y4m");
  writeQrVideo(foreignVideo, "https://evil.example/assistant?s=AAAAAAAAAAAAAAAAAAAAAA#t=x");

  async function scanWith(video: string) {
    const b = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
    });
    const context = await b.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      locale: "en-US",
      isMobile: true,
      hasTouch: true,
      permissions: ["camera"],
      extraHTTPHeaders: { "X-Forwarded-For": ADDRESS },
    });
    const page = await context.newPage();
    // Nothing the camera sees may leave the page: record every request it makes.
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") posts.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto("/app/scan");
    // No camera before the tap.
    await expect(page.getByRole("button", { name: "Turn on the camera" })).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.querySelector("video")?.srcObject ?? null)).toBeNull();
    await page.getByRole("button", { name: "Turn on the camera" }).click();
    return { b, page, posts };
  }

  // A QR from another site is refused and never opened.
  const foreign = await scanWith(foreignVideo);
  await expect(foreign.page.getByText("This QR is not a KIBO kiosk.")).toBeVisible({ timeout: 20_000 });
  await expect(foreign.page).toHaveURL(/\/app\/scan$/);
  expect(foreign.posts).toEqual([]);
  await foreign.b.close();

  const ok = await scanWith(kioskVideo);
  await expect(ok.page).toHaveURL(`/assistant?s=${s.sessionId}`, { timeout: 20_000 });
  // The claim ran (the fragment is gone only after it) and is the only thing the scan sent.
  await expect.poll(() => ok.page.evaluate((k) => localStorage.getItem(k), `kibo.phone.${s.sessionId}`)).not.toBeNull();
  expect(ok.posts.filter((p) => !p.startsWith("POST /api/ping"))).toEqual(["POST /api/session/claim"]);
  expect(await pairStatus(request, s.pairCode)).toBe(409);
  await ok.b.close();
});

test("/app/scan without a camera offers the camera app and a pasted link, checked like a scan", async ({ page, request }) => {
  const s = await newSession(request);
  // As when the camera is denied or missing.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
    });
  });
  await page.goto("/app/scan");
  await page.getByRole("button", { name: "Turn on the camera" }).click({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "The camera isn't available." })).toBeVisible();
  const link = page.getByLabel("Kiosk link");
  await link.fill("https://evil.example/assistant");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("This QR is not a KIBO kiosk.")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/scan$/);
  await link.fill(s.claimUrl);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(`/assistant?s=${s.sessionId}`);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), `kibo.phone.${s.sessionId}`)).not.toBeNull();
});
