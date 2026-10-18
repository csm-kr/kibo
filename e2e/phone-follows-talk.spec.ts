import { expect, test, type Browser, type Page } from "@playwright/test";
import { command, kioskRoot, readClaim, warmPhone } from "./helpers";

// Owner 10-18 on production, by voice on their own phone: the kiosk showed every burger, side and coleslaw as it was
// said, but the phone did not move down with the talk, so the line with its photo stayed under the fold (I-430). The
// AI's calls go through the API with the phone's device token, as Gemini Live sends them; no tap on the phone.

const LAPTOP = "192.0.2.150";
const PHONE = "192.0.2.151";

// Its own addresses for the dev server's per-IP limits (R-005).
test.use({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": LAPTOP } });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

/** The laptop on /demo [Start] and the judge's own phone at 390×844, past its first screens by typing. */
async function ownPhone(laptop: Page, browser: Browser, baseURL: string | undefined, kioskId: string) {
  await laptop.goto(`/demo?k=${kioskId}`);
  await laptop.getByRole("button", { name: "Start", exact: true }).click();
  await expect(laptop.locator("main[data-demo-own-phone]")).toBeVisible();
  const { url, sessionId } = await readClaim(laptop);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "X-Forwarded-For": PHONE },
  });
  const phone = await context.newPage();
  await phone.goto(url);
  await phone.getByRole("button", { name: "Type instead" }).click();
  const key = `kibo.phone.${sessionId}`;
  await expect.poll(() => phone.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await phone.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  let seq = 0;
  const ai = (type: string, args: object) =>
    command(phone.request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  return { context, phone, ai };
}

const newest = (phone: Page) => phone.locator("[data-phone-screen] [data-line-id]").last();

test("burger shop by voice: each line the AI adds comes into view on the phone, photo and all", async ({ page: laptop, browser }, info) => {
  const { context, phone, ai } = await ownPhone(laptop, browser, info.project.use.baseURL, "malo");
  try {
    await ai("setDineOption", { option: "eat_in" });
    await expect(phone.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
    const adds = [
      { itemId: "crispy_chicken_burger", variant: "set", qty: 1, selections: { side: ["coleslaw"], drink: ["cider"] } },
      { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_m"], drink: ["cider"] } },
      { itemId: "bulgogi_burger", variant: "single", qty: 1 },
      { itemId: "coleslaw", variant: "single", qty: 1 },
      { itemId: "cheese_burger", variant: "single", qty: 2 },
    ];
    for (const [i, args] of adds.entries()) {
      await ai("addToCart", args);
      await expect(phone.locator("[data-phone-screen] [data-line-id]")).toHaveCount(i + 1);
      // The kiosk shows it, and so does the phone: the new line whole, above the dock.
      await expect(newest(phone), `line ${i + 1}`).toBeInViewport({ ratio: 1 });
    }
    await expect(kioskRoot(laptop).getByText("코울슬로").first()).toBeVisible();
  } finally {
    // The phone at the end, for the QA record (test-results).
    await phone.screenshot({ path: test.info().outputPath("phone.png") });
    await context.close();
  }
});

test("ticket machine by voice: each ticket the AI adds comes into view on the phone", async ({ page: laptop, browser }, info) => {
  const { context, phone, ai } = await ownPhone(laptop, browser, info.project.use.baseURL, "airport_rail");
  try {
    const adds = [
      { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } },
      { itemId: "all_stop_harbor_gate", variant: "single", qty: 1, selections: { passenger: ["adult"] } },
      { itemId: "day_pass", variant: "single", qty: 1 },
      { itemId: "two_day_pass", variant: "single", qty: 1 },
      { itemId: "all_stop_old_town", variant: "single", qty: 1, selections: { passenger: ["adult"] } },
    ];
    for (const [i, args] of adds.entries()) {
      await ai("addToCart", args);
      await expect(phone.locator("[data-phone-screen] [data-line-id]")).toHaveCount(i + 1);
      await expect(newest(phone), `ticket ${i + 1}`).toBeInViewport({ ratio: 1 });
    }
  } finally {
    await phone.screenshot({ path: test.info().outputPath("phone.png") });
    await context.close();
  }
});
