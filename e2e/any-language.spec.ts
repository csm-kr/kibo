import { expect, test } from "@playwright/test";
import { warmPhone } from "./helpers";

// The phone's language picker (14-final:4): an AI-only language keeps English screens, is remembered on the phone, and
// goes to the voice token and the text agent as `language`. No model calls: both routes are answered by the test.

// Its own address for the dev server's per-IP limits (R-005).
test.use({
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.55" },
  viewport: { width: 390, height: 844 },
  locale: "en-US",
  // A fake microphone that is always allowed, as in playwright.qa.config.ts, so the mic asks for a token.
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

test("choosing 日本語 sends language ja with voice and text, keeps English screens, and survives a reload", async ({ page, request }) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string };
  await page.goto(created.claimUrl);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();

  await page.getByRole("button", { name: "Language and text size: English" }).click();
  await page.getByRole("dialog", { name: "Language" }).getByRole("button", { name: /^日本語/ }).click();
  await expect(page.getByRole("button", { name: "Language and text size: 日本語" })).toBeVisible();
  // English screens, Japanese mic label.
  await expect(page.getByText("Nothing in your order yet.")).toBeVisible();
  await expect(page.locator("[data-voice-state]")).toContainText("押して話す");

  const bodies: Record<string, { locale?: string; language?: string }> = {};
  await page.route("**/api/live-token", async (route) => {
    bodies.live = route.request().postDataJSON();
    await route.fulfill({ status: 429, json: { ok: false, error: { code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." } } });
  });
  await page.route("**/api/chat", async (route) => {
    bodies.chat = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, reply: "かしこまりました。", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } });
  });

  await page.locator("[data-voice-state]").click();
  await expect.poll(() => bodies.live?.language).toBe("ja");
  expect(bodies.live?.locale).toBe("en");

  const field = page.getByRole("textbox", { name: "Type your order" });
  await field.fill("チーズバーガーを1つください。");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("かしこまりました。")).toBeVisible();
  expect(bodies.chat).toMatchObject({ locale: "en", language: "ja" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Language and text size: 日本語" })).toBeVisible();

  // Back to English: the AI language ends, and nothing extra is sent.
  await page.getByRole("button", { name: "Language and text size: 日本語" }).click();
  await page.getByRole("dialog", { name: "Language" }).getByRole("button", { name: /^English/ }).click();
  expect(await page.evaluate(() => localStorage.getItem("kibo.phone.aiLang"))).toBe("");
});
