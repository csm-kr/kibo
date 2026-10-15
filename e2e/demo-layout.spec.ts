import { expect, test, type Page } from "@playwright/test";
import { openScenarios } from "./helpers";

// /demo D2 and D3 layout, measured in CSS px (design QA 10-15, issue #1 batch B): the scenario column lines up with
// the kiosk and phone columns, its scroll areas end in a fade while more is below, "What the AI did" reads as one
// typeface and gives way under the phone. No model calls: /api/chat is answered by the test.

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test.use({
  viewport: SIZES[2],
  locale: "en-US",
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.81" },
});

interface DemoSession {
  sessionId: string;
  deviceToken: string;
}

async function start(page: Page, kioskId = "malo"): Promise<DemoSession> {
  await page.goto(`/demo?k=${kioskId}`);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  return (await (await created).json()) as DemoSession;
}

test("the scenario column lines up with the kiosk and phone columns at every judge size (#1 4)", async ({ page }) => {
  await start(page);
  for (const vp of SIZES) {
    await page.setViewportSize(vp);
    await openScenarios(page);
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const mid = (r: DOMRect) => r.top + r.height / 2;
      const toggle = document.querySelector<HTMLElement>('[data-scenario-guide] button[aria-controls="demo-scenario-guide"]')!;
      // The part of the toggle that is drawn: the button itself, or its white pill inside a larger hit area.
      const clear = (el: Element) => getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)";
      const pill = clear(toggle) ? ([...toggle.querySelectorAll("*")].find((el) => !clear(el)) ?? toggle) : toggle;
      return {
        kioskCaption: mid(box("#demo-kiosk-caption")),
        phoneCaption: mid(box("#demo-phone-caption")),
        pill: mid(pill.getBoundingClientRect()),
        hit: toggle.getBoundingClientRect().height,
        phoneTop: box("[data-phone-screen]").top,
        guideTop: box("#demo-scenario-guide").top,
      };
    });
    const at = `${vp.width}x${vp.height}`;
    expect(Math.abs(m.pill - m.phoneCaption), `${at}: [Scenarios] centre vs the column captions`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.kioskCaption - m.phoneCaption), `${at}: kiosk and phone captions`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.guideTop - m.phoneTop), `${at}: guide top vs phone top`).toBeLessThanOrEqual(1);
    expect(m.hit, `${at}: [Scenarios] target height`).toBeGreaterThanOrEqual(56);
  }
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.83" } });

  test("on the learned pizza kiosk the guide is as tall as its one card (#1 12)", async ({ page }) => {
    await start(page, "doughhouse");
    await openScenarios(page);
    await expect(page.locator('[data-scenario="learned-pizza"]')).toBeVisible();
    const empty = await page.locator("#demo-scenario-guide").evaluate((el) => {
      const content = [...el.children].filter((c) => !c.hasAttribute("data-scroll-fade"));
      return el.getBoundingClientRect().bottom - content[content.length - 1].getBoundingClientRect().bottom;
    });
    // Only the panel's own 16px padding under the card.
    expect(empty).toBeLessThanOrEqual(17);
  });
});
