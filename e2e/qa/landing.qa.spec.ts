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

const SECTIONS = ["hero", "people", "problem", "how", "places", "safety", "whynot", "kiosks", "cloud", "trust", "access", "footer"];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US" });

test("root landing page", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Try the live demo" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Try the live demo" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "Two-device mode" })).toHaveAttribute("href", "/kiosk");
  // "One phone, many kiosks": each place opens its working demo.
  for (const [name, k] of [["burger shop", "malo"], ["airport rail", "airport_rail"], ["pizza shop", "doughhouse"]]) {
    await expect(page.getByRole("link", { name: `Try the ${name}` })).toHaveAttribute("href", `/demo?k=${k}`);
  }
  // Every external fact shows its source, and evidence paths link to the public repo (docs/RULE.md R-001).
  const problem = page.locator('[data-landing-section="problem"]');
  await expect(problem.getByText("Source:")).toHaveCount(6);
  for (const href of await page.locator('a[href*="github.com/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))))
    expect(href).toMatch(/^https:\/\/github\.com\/[^/]+\/kibo\/(blob|tree)\/main\//);
  await expect(page.getByText("KIBO is not the first to connect a phone to a kiosk.")).toBeVisible();
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

// UI_GUIDE "Phone design": no 2px dark outlines anywhere, white cards with the soft shadow and no border (I-165).
test("no dark 2px outlines; the cards and the secondary links follow the phone design (#1 item 7)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Two-device mode" })).toBeVisible({ timeout: 60_000 });
  const look = await page.evaluate(() => {
    const lum = (c: string) => {
      const m = (c.match(/[\d.]+/g) ?? []).map(Number);
      return m.length >= 4 && m[3] === 0 ? 255 : 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    };
    const name = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    const outlines = [...document.querySelectorAll("main *")]
      .filter((el) => el.checkVisibility())
      .filter((el) => {
        const cs = getComputedStyle(el);
        const sides = (["Top", "Right", "Bottom", "Left"] as const).map((s) =>
          cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === "none" ? 0 : parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)),
        );
        return sides.every((w) => w >= 2) && lum(cs.borderTopColor) < 80;
      })
      .map((el) => `${el.tagName.toLowerCase()} "${name(el)}"`);
    // White surfaces that hold content: the cards and the diagram's scroll box.
    const cards = [...document.querySelectorAll("main *")]
      .filter((el) => getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)")
      .map((el) => {
        const cs = getComputedStyle(el);
        return { card: name(el), border: cs.borderTopStyle === "none" ? "0px" : cs.borderTopWidth, shadow: cs.boxShadow !== "none" };
      });
    return { outlines, cards };
  });
  expect(look.outlines).toEqual([]);
  expect(look.cards.length).toBeGreaterThan(0);
  expect(look.cards.filter((c) => c.border !== "0px" || !c.shadow)).toEqual([]);
  // Secondary links are kibo-tint with no border, like the phone's [Pick more].
  for (const name of ["Two-device mode", "Try the burger shop", "Try the airport rail", "Try the pizza shop"]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link, name).toHaveCSS("background-color", "rgb(238, 240, 253)");
    await expect(link, name).toHaveCSS("border-top-width", "0px");
  }
});

// #1 35: the hero picture was saved 1280px wide and drawn 1024 CSS px wide, so a 2× (Retina) screen got the 1280px
// original for its 2048 device px and blurred it (1.6× upscale). The file the browser picks covers the device pixels.
test.describe(() => {
  test.use({ deviceScaleFactor: 2 });

  test("the hero picture is sharp on a 2× screen: never upscaled (#1 35)", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('img[src*="demo.webp"], img[srcset*="demo.webp"]').first();
    await expect(hero).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // The file's own pixels: with a srcset, naturalWidth is scaled by the candidate's density, so decode what came.
    const fit = await hero.evaluate(async (img: HTMLImageElement) => ({
      devicePx: Math.round(img.getBoundingClientRect().width * devicePixelRatio),
      imagePx: (await createImageBitmap(await (await fetch(img.currentSrc)).blob())).width,
    }));
    expect(fit.devicePx).toBe(2048);
    expect(fit.imagePx, `${fit.imagePx}px image for ${fit.devicePx} device px`).toBeGreaterThanOrEqual(fit.devicePx);
  });
});
