import { expect, test, type Page } from "@playwright/test";
import { claim, command, kioskRoot } from "./helpers";

// I-033: a session stream the server refuses (429 "Too many open screens", or a 503) closes EventSource for good.
// The screen says so in a plain line and reopens the stream after 3 s, 6 s, 12 s, … up to 30 s
// (src/lib/client/streamControl.ts). Here the browser answers the events route with the server's 429 until the test
// lets it through.

test.use({ locale: "en-US", extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.52" } });

const EVENTS = "**/api/session/*/events";
const BUSY_EN = "Busy right now. Reconnecting…";
const BUSY_KO = "잠시 후 다시 연결합니다…";

async function refuseStreams(page: Page) {
  await page.route(EVENTS, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many open screens. Please close one and try again." } }),
    }),
  );
}

test("/demo: a refused stream says so on both halves, then reconnects by itself", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await refuseStreams(page);
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  const phone = page.locator("[data-phone-screen]");
  await expect(phone).toHaveAttribute("data-phone-screen", "connecting");
  await expect(phone.getByRole("status").filter({ hasText: BUSY_EN })).toBeVisible();
  await expect(page.locator("[data-stream-retrying]")).toHaveText(BUSY_KO);

  await page.unroute(EVENTS);
  await expect(page.locator("[data-stream-retrying]")).toHaveCount(0, { timeout: 30_000 });
  await expect(phone).not.toHaveAttribute("data-phone-screen", "connecting");
  await expect(page.getByText(BUSY_EN)).toHaveCount(0);
});

test("/kiosk: the Korean line shows until the stream reconnects, then touch ordering works", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await refuseStreams(page);
  await page.goto("/kiosk?k=malo");
  await expect(page.locator("[data-stream-retrying]")).toHaveText(BUSY_KO);
  const touch = page.getByRole("button", { name: /화면을 눌러서 주문/ });
  await expect(touch).toBeDisabled();

  await page.unroute(EVENTS);
  await expect(page.locator("[data-stream-retrying]")).toHaveCount(0, { timeout: 30_000 });
  await touch.click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
});

test("/assistant: a stream refused mid-order keeps the cart, shows a busy pill, then reconnects", async ({ page, request }) => {
  // The pause closes the stream; tapping it reopens the stream into the refusal. 8 s, so the first retry (3 s after
  // the refusal) comes before the next pause.
  await page.addInitScript(() => {
    (window as { __kiboStreamIdleMs?: number }).__kiboStreamIdleMs = 8_000;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const created = (await (await request.post("/api/session", { data: { kioskId: "malo" } })).json()) as {
    sessionId: string;
    claimUrl: string;
  };
  const claimed = await claim(request, created.sessionId, new URL(created.claimUrl).hash.replace(/^#t=/, ""));
  const { deviceToken } = (await claimed.json()) as { deviceToken: string };
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [`kibo.phone.${created.sessionId}`, deviceToken]);
  const phone = (type: string, args: object, extra: { source: string; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });
  await phone("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } }, { source: "voice", utteranceSeq: 1 });

  await page.goto(`/assistant?s=${created.sessionId}`);
  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  const layer = page.locator("[data-stream-paused]");
  await expect(layer).toBeVisible({ timeout: 15_000 });

  await refuseStreams(page);
  await layer.click();
  await expect(page.getByRole("status").filter({ hasText: BUSY_EN })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

  await page.unroute(EVENTS);
  await expect(page.getByText(BUSY_EN)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
});
