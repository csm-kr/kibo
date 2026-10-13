import { expect, test } from "@playwright/test";
import { qaState, type Findings, type Profile } from "./checks";

// UI QA of the phone design preview `/design/phone` (docs/UI_GUIDE.md "Phone design") at the main and small phone
// sizes, judged by the phone numbers. The target checks only measure what is on screen, so each component frame is
// scrolled to the top and checked on its own, with its own screenshot. No API calls, so no X-Forwarded-For (R-005).

const DESIGN: Profile = { route: "/design/phone", root: "main", minFont: 16, minTarget: 56 };

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const FRAMES = ["app-bar", "conversation", "cart", "suggestions", "dock", "dock-typing", "confirm", "pay", "done"];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US" });

test("phone design preview", async ({ page }, info) => {
  await page.goto("/design/phone");
  await expect(page.getByRole("heading", { name: "Phone design preview" })).toBeVisible({ timeout: 60_000 });

  // The dock stays within 150px at 390x844 (docs/UI_GUIDE.md "Phone design").
  const dock = page.locator('[data-preview="dock"] .shadow-dock').first();
  expect((await dock.boundingBox())?.height ?? 999).toBeLessThanOrEqual(150);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const frame of FRAMES) {
      await page.locator(`[data-preview="${frame}"]`).evaluate((el) => el.scrollIntoView({ block: "start" }));
      const f: Findings = await qaState(page, info, DESIGN, `design-${frame}`, { reflow: true });
      expect.soft(f.h, `/design/phone ${frame} ${vp.width}x${vp.height}: H failures`).toEqual([]);
      if (STRICT) expect.soft(f.t, `/design/phone ${frame} ${vp.width}x${vp.height}: T misses`).toEqual([]);
    }
  }

  // Korean copy is longer and wraps between words (keep-all): the app bar, the open text field and the confirm bar.
  await page.getByRole("button", { name: "한국어" }).first().click();
  await expect(page.getByText("연결됨")).toBeVisible();
  for (const frame of ["app-bar", "dock-typing", "confirm"]) {
    await page.locator(`[data-preview="${frame}"]`).evaluate((el) => el.scrollIntoView({ block: "start" }));
    const f: Findings = await qaState(page, info, DESIGN, `design-${frame}-ko`, { reflow: true });
    expect.soft(f.h, `/design/phone ${frame} ko 360x800: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `/design/phone ${frame} ko 360x800: T misses`).toEqual([]);
  }
});
