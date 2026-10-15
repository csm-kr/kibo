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

/** The replay plays by itself at 4×; pause it and go back to the first turn. */
async function stopAtStart(page: Page) {
  const play = page.locator("[data-learn-play]");
  await expect(play).toHaveText("Pause", { timeout: 60_000 });
  await play.click();
  await expect(play).toHaveText(/^Play/);
  await page.getByRole("slider", { name: "Turn" }).press("Home");
}

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
  await stopAtStart(page);
  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(page.locator("[data-learn-skill]")).toBeVisible();
  await check(page, info, "replay-themepark-skill", "[data-learn-skill]");
});

test("learn replay: start, a stopped tap, the finish and the learned skill", async ({ page }, info) => {
  await page.goto("/learn/airport-shop");
  await stopAtStart(page);
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 64/);
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
  await stopAtStart(page);
  await expect(page.locator("[data-learn-action]")).toContainText("Refused to tap 주문하기 (Order)");
  await check(page, info, "replay-refused");
  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(page.locator("[data-learn-order]")).toBeVisible();
  await check(page, info, "replay-order", "[data-learn-order]");
});

// The replay picture is the kiosk alone (the recorded frames had the recording page's dark frame baked in, a black box
// beside the kiosk), drawn at its own aspect ratio, as tall as before and fully on screen at the judge sizes (#1 item 17).
for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
  test(`learn replay at ${vp.width}x${vp.height}: every run's picture keeps its shape and fits the screen (#1 item 17)`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const run of ["bunsik", "themepark", "airport-shop", "doughhouse"]) {
      await page.goto(`/learn/${run}`);
      await stopAtStart(page);
      // The slider took focus and may have scrolled itself into view; the picture is judged from the top, as on arrival.
      await page.evaluate(() => window.scrollTo(0, 0));
      const shot = page.getByRole("img", { name: "The kiosk screen after turn 1" });
      await expect(shot, run).toBeInViewport({ ratio: 1 });
      const box = await shot.evaluate((img: HTMLImageElement) => {
        const r = img.getBoundingClientRect();
        return { drawn: r.width / r.height, own: img.naturalWidth / img.naturalHeight, height: r.height };
      });
      expect(Math.abs(box.drawn - box.own), run).toBeLessThan(0.01);
      // The height the 720×1067 frames had: the viewport less 280px, between 415 and 711px.
      expect(box.height, run).toBeCloseTo(Math.min(Math.max(vp.height - 280, 415), 711), 0);
    }
  });
}

// #1 33: on a phone the 24px chevrons in [Back] and [Next] were squeezed by the buttons' width (2–12px at 390 and 360).
// Every icon in the controls row keeps its 24px, and every label there stays on one line inside its button, in each
// state of [Play] (Pause while it plays, Play, Play again at the end).
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`learn replay at ${vp.width}x${vp.height}: the controls' icons keep 24px and their labels fit (#1 33)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/learn/doughhouse");
    const play = page.locator("[data-learn-play]");
    const row = page.locator("[data-learn-next]").locator("xpath=..");
    const measure = () =>
      row.evaluate((el) =>
        [...el.querySelectorAll("button")].map((b) => {
          const icon = b.querySelector("svg")!.getBoundingClientRect();
          // The label's line boxes: its text nodes only (the icon's own box is not a line).
          const tops = new Set<number>();
          for (const n of b.childNodes) {
            if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
          }
          const lines = tops.size;
          return { label: b.textContent?.trim(), icon: [Math.round(icon.width), Math.round(icon.height)], fits: b.scrollWidth <= b.clientWidth, lines };
        }),
      );
    const expectWhole = async (state: string) => {
      for (const b of await measure()) {
        expect(b.icon, `${state}: ${b.label} icon`).toEqual([24, 24]);
        expect(b.fits, `${state}: ${b.label} fits its button`).toBe(true);
        expect(b.lines, `${state}: ${b.label} on one line`).toBe(1);
      }
    };
    await expect(play).toHaveText("Pause", { timeout: 60_000 });
    await expectWhole("playing");
    await play.click();
    await expect(play).toHaveText("Play");
    await expectWhole("paused");
    await page.getByRole("slider", { name: "Turn" }).press("End");
    await expect(play).toHaveText("Play again");
    await expectWhole("at the end");
  });
}
