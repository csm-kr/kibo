import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { command, kioskRoot } from "../helpers";
import { DEMO, HOME, qaState, type Findings } from "./checks";

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

async function check(page: Page, info: TestInfo, state: string, before?: () => Promise<void>) {
  for (const vp of VIEWPORTS) {
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

test("root landing page", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible({ timeout: 60_000 });
  for (const vp of [...VIEWPORTS, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, HOME, "landing", { reflow: true });
    expect.soft(f.h, `/ ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `/ ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
});
