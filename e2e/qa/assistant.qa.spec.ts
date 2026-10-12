import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { claim, command, warmPhone } from "../helpers";
import { PHONE, qaState, type Findings } from "./checks";

// UI QA of the phone screens (docs/UX.md screen map P2–P7, PX) at the phone viewports in docs/UI_QA.md, each with
// the 320px reflow check. States are reached through the real UI and the API (kiosk token from a session created
// here, device token from the phone's own claim), never by calling the model or mocking components.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  // Reflow width (WCAG 1.4.10): every check, not only the horizontal-scroll one.
  { width: 320, height: 700 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US", isMobile: true, hasTouch: true });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function check(page: Page, info: TestInfo, state: string, viewports = VIEWPORTS) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, PHONE, state, { reflow: true });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const screenOf = (page: Page) => page.locator("[data-phone-screen]");

/** A kiosk session from the API and the phone opened on its claim URL. */
async function openPhone(page: Page, request: APIRequestContext) {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  const phone = (type: string, args: object, extra: { source?: string; utteranceSeq?: number; cartVersion?: number } = {}) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, source: "voice", ...extra });
  const kiosk = (type: string) => command(request, created.kioskToken, { sessionId: created.sessionId, type, source: "touch" });
  return { ...created, deviceToken, phone, kiosk };
}

const cheeseSet = (drink: string, extra: Record<string, string[]> = {}) => ({
  itemId: "cheese_burger",
  variant: "set",
  qty: 1,
  selections: { drink: [drink], ...extra },
});

test("phone path: start to order number", async ({ page, request }, info) => {
  const s = await openPhone(page, request);
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "start");
  await check(page, info, "P-start");

  await page.getByRole("button", { name: "Start" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "dine");
  await check(page, info, "P2-dine");

  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByText("Nothing in your order yet.")).toBeVisible();
  await check(page, info, "P3-empty");

  await s.phone("addToCart", cheeseSet("zero_cola", { ingredients: ["no_pickles"] }), { utteranceSeq: 1 });
  await s.phone("addToCart", cheeseSet("cider"), { utteranceSeq: 1 });
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(2);
  await check(page, info, "P3-two-lines");

  await s.phone("offerChoices", {
    templateId: "pick_item",
    choices: [
      { kind: "item", id: "bulgogi_burger" },
      { kind: "item", id: "double_cheese_burger" },
      { kind: "item", id: "classic_burger" },
    ],
  });
  await expect(page.getByRole("heading", { name: "Which one would you like?" })).toBeVisible();
  await check(page, info, "P3-choices");

  // /api/chat answers with its real rate-limit reply here, so the check never reaches the model.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests." } },
    }),
  );
  await page.getByRole("button", { name: "Make both fries large." }).click();
  await expect(page.getByText(/^Too many requests\. Please try again in a moment\./)).toBeVisible();
  await check(page, info, "P3-error");
  await page.unroute("**/api/chat");

  const checkout = await s.phone("requestCheckout", {}, { utteranceSeq: 2 });
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  expect(checkout.status).toBe("confirming");
  await check(page, info, "P4-confirm");

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "pay");
  await check(page, info, "P5-pay");

  await s.kiosk("cardAction");
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "done");
  await check(page, info, "P6-done");
});

test("P7: someone else is using this kiosk", async ({ page, request }, info) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const { sessionId, claimUrl } = (await res.json()) as { sessionId: string; claimUrl: string };
  const claimToken = new URL(claimUrl).hash.replace(/^#t=/, "");
  expect((await claim(request, sessionId, claimToken)).status()).toBe(200);
  await page.goto(claimUrl);
  await expect(page.getByRole("heading", { name: "Someone else is using this kiosk." })).toBeVisible();
  await check(page, info, "P7-taken");
});

test("PX: idle warning one minute before expiry", async ({ page, request }, info) => {
  await page.clock.install();
  const s = await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  expect(s.sessionId).toBeTruthy();

  // Sessions expire 10 min after the last activity. Moving only the page clock 9.5 min ahead shows the warning
  // without waiting; the next 30 s ping re-measures the offset and hides it again.
  await page.clock.setSystemTime(Date.now() + 9.5 * 60_000);
  await expect(page.getByRole("alertdialog", { name: "Still ordering?" })).toBeVisible();
  // The main viewport only: the warning goes away at the next ping, 30 s later.
  await check(page, info, "PX-idle-warning", [VIEWPORTS[0]]);
});
