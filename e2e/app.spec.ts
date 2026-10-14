import { expect, test, type APIRequestContext } from "@playwright/test";
import { command, warmPhone } from "./helpers";

// The phone app home /app: settings chosen there are read by /assistant, and [Continue my order] shows only while
// this phone holds an open order. The kiosk side is plain API calls with the kiosk token (no model calls).

// Its own address (R-005): the spec creates a session and sends kiosk commands.
test.use({
  viewport: { width: 390, height: 844 },
  locale: "en-US",
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.41" },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function kioskSession(request: APIRequestContext) {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  const kiosk = (type: string, args: object = {}, cartVersion?: number) =>
    command(request, created.kioskToken, { sessionId: created.sessionId, type, args, source: "touch", cartVersion });
  return { ...created, kiosk };
}

test("settings on /app reach /assistant, and Continue my order lasts until the order is paid", async ({ page, request }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Talk to any kiosk that shows the KIBO QR." })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Scan a kiosk" })).toHaveAttribute("href", "/app/scan");
  // No order yet: nothing to continue.
  await expect(page.getByRole("link", { name: "Continue my order" })).toHaveCount(0);

  await page.getByRole("button", { name: "한국어" }).click();
  await expect(page.getByRole("heading", { name: "KIBO QR이 있는 키오스크라면 말로 주문할 수 있어요." })).toBeVisible();
  await page.getByRole("switch", { name: "AI 목소리" }).click();
  // Larger text is at the top of the page and in the settings card; both are one setting (15-judge-fixes:2).
  const largeText = page.getByRole("switch", { name: "큰 글씨" });
  await expect(largeText).toHaveCount(2);
  await largeText.first().click();
  await expect(largeText.last()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "AI 목소리" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("html")).toHaveAttribute("style", /font-size: 115%/);

  // They persist across a reload.
  await page.reload();
  await expect(page.getByRole("switch", { name: "큰 글씨" }).first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");

  // A kiosk order mid-way (dine option chosen), then the phone scans its QR: Korean, AI voice off, larger text.
  const s = await kioskSession(request);
  await s.kiosk("setDineOption", { option: "eat_in" });
  await page.goto(s.claimUrl);
  await page.getByRole("button", { name: "글자로 입력할게요" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByRole("switch", { name: "AI 목소리" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("html")).toHaveAttribute("style", /font-size: 115%/);

  // Back home: the open order can be continued, and the link reconnects without a new claim.
  await page.goto("/app");
  const resume = page.getByRole("link", { name: "하던 주문 이어서 하기" });
  await expect(resume).toHaveAttribute("href", `/assistant?s=${s.sessionId}`);
  await resume.click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");

  // Paid on the kiosk: the phone shows the order number, and /app no longer offers to continue.
  await s.kiosk("addToCart", { itemId: "fries_m", variant: "single", qty: 1, selections: {} });
  const review = await s.kiosk("requestCheckout");
  await s.kiosk("confirmCheckout", {}, review.cartVersion);
  await s.kiosk("cardAction");
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "done");
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "이렇게 써요" })).toBeVisible();
  await expect(page.getByRole("link", { name: "하던 주문 이어서 하기" })).toHaveCount(0);
});
