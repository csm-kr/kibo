import { expect, test } from "@playwright/test";
import { warmPhone } from "./helpers";

// I-410: when this order's own voice tokens are used up, the phone says so instead of "Voice is busy", which read as the
// server failing. No model calls: the token route is answered by the test.

// Its own address for the dev server's per-IP limits (R-005).
test.use({
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.62" },
  viewport: { width: 390, height: 844 },
  locale: "en-US",
  // A fake microphone that is always allowed, as in playwright.qa.config.ts, so the mic asks for a token.
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

test("a session whose voice tokens are used up says the order's voice time is up, not that voice is busy", async ({ page, request }) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { claimUrl: string };
  await page.goto(created.claimUrl);
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();

  await page.route("**/api/live-token", (route) =>
    route.fulfill({
      status: 429,
      json: {
        ok: false,
        error: { code: "RATE_LIMITED", message: "Voice time for this order is up. Please type instead.", detail: { limit: "session" } },
      },
    }),
  );
  await page.locator("[data-voice-state]").click();
  await expect(page.getByText("Voice time for this order is up. Please type.")).toBeVisible();
  await expect(page.getByText("Voice is busy right now. Please type instead.")).toHaveCount(0);
  await expect(page.locator("[data-voice-state]")).toHaveAttribute("data-voice-state", "error");
});
