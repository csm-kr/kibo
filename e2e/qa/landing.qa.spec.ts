import { expect, test } from "@playwright/test";
import { HOME, qaState, type Findings } from "./checks";

// UI QA of the root landing page `/` at the judge laptop sizes and on phones, each with the 320px reflow check.
// The page is long and the target checks only measure what is on screen, so each section is scrolled to the top
// and checked on its own, with its own screenshot.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
];

const SECTIONS = ["hero", "people", "how", "safety", "kiosks", "cloud", "access", "footer"];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US" });

test("root landing page", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Try the live demo" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Try the live demo" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "Two-device mode" })).toHaveAttribute("href", "/kiosk");
  // Every capture on the page loads (the step forbids mockups; a missing file would show a broken image).
  // Lazy images below the fold have not loaded yet, so each file is fetched instead.
  const srcs = await page.locator("img").evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src));
  for (const src of srcs) expect((await page.request.get(src)).ok(), src).toBe(true);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const section of SECTIONS) {
      await page.locator(`[data-landing-section="${section}"]`).evaluate((el) => el.scrollIntoView({ block: "start" }));
      const f: Findings = await qaState(page, info, HOME, `landing-${section}`, { reflow: true });
      expect.soft(f.h, `/ ${section} ${vp.width}x${vp.height}: H failures`).toEqual([]);
      if (STRICT) expect.soft(f.t, `/ ${section} ${vp.width}x${vp.height}: T misses`).toEqual([]);
    }
  }
});
