import { expect, test, type Page } from "@playwright/test";
import { LEARN, qaState, type Findings } from "./checks";

// UI QA of /learn and the learn replay /learn/<runId> at the judge laptop sizes and on a phone (the replay stacks
// there). The target checks only measure what is on screen, so long pages are scrolled to each part first.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US" });

async function check(page: Page, info: Parameters<typeof qaState>[1], state: string, scrollTo?: string) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    if (scrollTo) await page.locator(scrollTo).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    else await page.evaluate(() => window.scrollTo(0, 0));
    const f: Findings = await qaState(page, info, LEARN, state, { reflow: vp.width === 390 });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
}

test("/learn index", async ({ page }, info) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Watch KIBO learn a kiosk from its screens alone." })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "index-top");
  await check(page, info, "index-cards-bunsik", '[data-learn-run="bunsik"]');
  await check(page, info, "index-cards", '[data-learn-run="themepark"]');
  await check(page, info, "index-cards-second", '[data-learn-run="airport-shop"]');
  await check(page, info, "index-cards-third", '[data-learn-run="doughhouse"]');
  await check(page, info, "index-real-kiosks", "[data-learn-real]");
});

test("learn replay: the fresh theme park run's finish and learned skill", async ({ page }, info) => {
  await page.goto("/learn/themepark");
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 87/, { timeout: 60_000 });
  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(page.locator("[data-learn-skill]")).toBeVisible();
  await check(page, info, "replay-themepark-skill", "[data-learn-skill]");
});

test("learn replay: start, a stopped tap, the finish and the learned skill", async ({ page }, info) => {
  await page.goto("/learn/airport-shop");
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 64/, { timeout: 60_000 });
  await check(page, info, "replay-start");

  // Turn 8: an ambiguous label, shown with its warning icon.
  for (let i = 1; i < 8; i++) await page.locator("[data-learn-next]").click();
  await expect(page.locator("[data-learn-action]")).toContainText("matches 4 buttons");
  await check(page, info, "replay-stopped-tap");

  await page.locator("[data-learn-zoom]").click();
  await check(page, info, "replay-larger-picture", "[data-learn-zoom]");
  await page.locator("[data-learn-zoom]").click();

  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(page.locator("[data-learn-skill]")).toBeVisible();
  await check(page, info, "replay-finish", "[data-learn-player]");
  await check(page, info, "replay-skill", "[data-learn-skill]");
});

test("learn replay: Doughhouse refused payment tap and the order button", async ({ page }, info) => {
  await page.goto("/learn/doughhouse");
  await expect(page.locator("[data-learn-action]")).toContainText("Refused to tap 주문하기", { timeout: 60_000 });
  await check(page, info, "replay-refused");
  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(page.locator("[data-learn-order]")).toBeVisible();
  await check(page, info, "replay-order", "[data-learn-order]");
});
