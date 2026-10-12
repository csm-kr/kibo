import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { command, kioskRoot } from "../helpers";
import { DEMO, qaState, type Findings } from "./checks";

// UI QA of /demo (docs/UX.md screen map D1–D3) at the judge viewports in docs/UI_QA.md. The checks measure the
// intro and the phone column; the kiosk half is the scaled canvas, whose sizes kiosk.qa.spec.ts checks at full size,
// so here it is judged on the screenshots. States are reached through the real UI and the API, never the model.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  locale: "en-US",
  // Its own address for the dev server's per-IP limit (60 a minute), shared with the other QA specs otherwise.
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.11" },
});

async function check(page: Page, info: TestInfo, state: string, before?: () => Promise<void>, viewports = VIEWPORTS) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await before?.();
    const f: Findings = await qaState(page, info, DEMO, state);
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
    // No page scroll at any judge viewport (the step's layout rule).
    const scroll = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect.soft(scroll, `${state} ${vp.width}x${vp.height}: page scroll`).toEqual({ x: 0, y: 0 });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("D1 to D3", async ({ page, request }, info) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "D1-intro");

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  await check(page, info, "D2-empty");

  // C3: Live refuses (here a mocked 429, no model call), and the text input comes forward with one sentence.
  await page.route("**/api/live-token", (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: { code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." } },
    }),
  );
  const mic = page.locator("[data-voice-state]");
  await expect(mic).toHaveAccessibleName(/Tap to talk/);
  expect((await mic.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(88);
  await mic.click();
  await expect(page.getByText("Voice is busy right now. Please type instead.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await check(page, info, "D2-voice-fallback");
  await page.unroute("**/api/live-token");

  const ai = (type: string, args: object, utteranceSeq: number) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq });
  await ai("setDineOption", { option: "eat_in" }, 1);
  // A new line per viewport, so each screenshot (taken first) falls inside its own 2 s highlight.
  const drinks = ["zero_cola", "cider", "cola"];
  let seq = 1;
  await check(page, info, "D2-ai-highlight", async () => {
    const drink = drinks[seq - 1];
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } }, seq++);
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(seq - 1);
  });

  await ai("requestCheckout", {}, seq++);
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
  await check(page, info, "D2-confirm");

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  await check(page, info, "D2-payment");

  await page.getByRole("button", { name: "Tap the card on the kiosk" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await check(page, info, "D3-done");
});

test.describe(() => {
  // Its own address: this test adds sessions on top of the two above (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.27" } });

  test("D1 to D3 with the airport rail ticket machine", async ({ page, request }, info) => {
    await page.goto("/demo?k=airport_rail");
    await expect(page.getByRole("link", { name: /SKYLINE AIRPORT RAIL/ })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
    await check(page, info, "D1-intro-rail");

    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
    await check(page, info, "D2-rail-empty");

    // A new line per viewport, so each screenshot falls inside its own 2 s highlight.
    const passengers = ["adult", "child", "senior"];
    let seq = 0;
    await check(page, info, "D2-rail-added", async () => {
      const passenger = passengers[seq];
      await command(request, s.deviceToken, {
        sessionId: s.sessionId,
        type: "addToCart",
        args: { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: [passenger] } },
        source: "voice",
        utteranceSeq: ++seq,
      });
      await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(seq);
    });

    await command(request, s.deviceToken, {
      sessionId: s.sessionId,
      type: "requestCheckout",
      args: {},
      source: "voice",
      utteranceSeq: ++seq,
    });
    await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
    await check(page, info, "D2-rail-confirm");

    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
    await check(page, info, "D2-rail-payment");

    await page.getByRole("button", { name: "Tap the card on the kiosk" }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
    await page.getByRole("button", { name: "출력 안 함" }).click();
    await expect(page.locator("[data-demo-end]")).toBeVisible();
    await check(page, info, "D3-rail-done");
  });
});

test("D1 to D3 with the learned pizza kiosk", async ({ page, request }, info) => {
  const judge = [VIEWPORTS[0]];
  await page.goto("/demo?k=doughhouse");
  await expect(page.getByRole("link", { name: /Doughhouse/ })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
  await check(page, info, "D1-intro-learned", undefined, judge);

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  const widget = page.locator("[data-learned-widget]");
  let seq = 0;
  const ai = (type: string, args: object = {}) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });

  await ai("setDineOption", { option: "eat_in" });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await ai("addToCart", { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } });
  await expect(page.getByRole("region", { name: "Your order" }).getByText("Pepperoni", { exact: true })).toBeVisible();
  await expect(widget).toContainText("Added: Pepperoni");
  await check(page, info, "D2-learned-added", undefined, judge);

  await ai("requestCheckout");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await check(page, info, "D3-learned-confirm", undefined, judge);
});
