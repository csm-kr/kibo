import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { command, openScenarios, textLines } from "./helpers";
import { HERO_ACTIONS, MIXED_ACTIONS } from "./recordedActions";

// /demo D2 and D3 layout, measured in CSS px (design QA 10-15, issue #1 batch B): the scenario column's scroll areas
// end in a fade while more is below, and "What the AI did" reads as one typeface. How the three columns line up, and
// what shows at the smallest size, is in e2e/demo-frame.spec.ts (#1 E). No model calls: /api/chat is answered by the
// test.

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

/** Chooses "Sunja's lunch" and sends its first sentence; the test stands in for the agent. */
async function sunjaStepOne(page: Page, request: APIRequestContext): Promise<DemoSession> {
  await openScenarios(page);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.locator('[data-scenario="sunja-lunch"]').click();
  const s = (await (await created).json()) as DemoSession;
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
  await page.route("**/api/chat", async (route) => {
    for (const a of HERO_ACTIONS) {
      await command(request, s.deviceToken, { sessionId: s.sessionId, type: a.tool, args: a.args, source: "text", utteranceSeq: 1 });
    }
    await route.fulfill({ json: { ok: true, reply: "Added two cheeseburger sets.", status: "ordering", cart: [], total: 0, cartVersion: 2, actions: HERO_ACTIONS } });
  });
  const guide = page.locator("[data-scenario-guide]");
  await guide.locator('[data-scenario-step="0"]').getByRole("button").click();
  await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(1);
  return s;
}

/**
 * A scroll area's bottom edge: whether more content is below, whether its fade shows there, and the text lines the
 * edge cuts that the fade does not cover. A cut line must sit inside a shown fade; nothing else may be cut.
 */
function bottomEdge(area: Locator) {
  return area.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const fade = el.querySelector(":scope > [data-scroll-fade]");
    const fr = fade?.getBoundingClientRect() ?? null;
    const shown = fade !== null && parseFloat(getComputedStyle(fade).opacity) > 0.9;
    const uncovered: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const line of range.getClientRects()) {
        if (line.width === 0 || line.top >= r.bottom - 0.5 || line.bottom <= r.bottom + 0.5) continue;
        if (!(shown && fr && line.top >= fr.top - 0.5)) uncovered.push(`${n.textContent?.trim().slice(0, 30)} (${Math.round(r.bottom - line.top)}px shown)`);
      }
    }
    return {
      more: el.scrollHeight - el.scrollTop - el.clientHeight > 1,
      shown,
      fadeHeight: fr ? fr.height : 0,
      fadeToEdge: fr ? Math.abs(r.bottom - fr.bottom) : null,
      uncovered,
    };
  });
}

async function expectFadeAtEdge(area: Locator, what: string) {
  // The fade follows scroll and resize events, so it settles a frame after them.
  const settled = async () => {
    const e = await bottomEdge(area);
    return e.uncovered.length === 0 && (!e.more || e.shown);
  };
  await expect.poll(settled, { message: `${what}: every line cut at the bottom edge lies under a shown fade` }).toBe(true);
  const edge = await bottomEdge(area);
  expect(edge.uncovered, `${what}: lines cut at the bottom edge without a fade`).toEqual([]);
  if (edge.more) {
    expect(edge.fadeHeight, `${what}: fade height`).toBeGreaterThanOrEqual(24);
    expect(edge.fadeToEdge, `${what}: fade sits on the bottom edge`).toBeLessThanOrEqual(1);
  }
  // At the end nothing is left to hint at, and the fade must not lie over the last lines.
  await area.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  await expect.poll(async () => (await bottomEdge(area)).shown, { message: `${what}: no fade at the end` }).toBe(false);
  await area.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
}

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.82" } });

  test("the scenario guide and 'What the AI did' end in a fade while more is below (#1 2)", async ({ page, request }) => {
    await start(page);
    const guide = page.locator("#demo-scenario-guide");
    await expect(page.locator("[data-scenario]").first()).toBeVisible();
    await expectFadeAtEdge(guide, "scenario list 1440");

    await sunjaStepOne(page, request);
    for (const vp of [SIZES[0], SIZES[3]]) {
      await page.setViewportSize(vp);
      await expectFadeAtEdge(guide, `Sunja step 1 ${vp.width}`);
    }

    // Six rows in "What the AI did" beside the phone overflow its share of the column.
    await page.setViewportSize(SIZES[2]);
    await page.unroute("**/api/chat");
    await page.route("**/api/chat", (route) =>
      route.fulfill({ json: { ok: true, reply: "OK.", status: "ordering", cart: [], total: 0, cartVersion: 2, actions: MIXED_ACTIONS } }),
    );
    await page.getByRole("textbox", { name: "Type your order" }).fill("Two cheeseburger sets");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const rows = page.locator("[data-action-strip] li");
    await expect(rows).toHaveCount(HERO_ACTIONS.length + MIXED_ACTIONS.length);
    await expectFadeAtEdge(page.locator("#demo-actions"), "What the AI did 1440");
  });
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

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.84" } });

  test("'What the AI did': one typeface, 16px titles, the technical line on one line (#1 5)", async ({ page, request }) => {
    const s = await start(page);
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await page.route("**/api/chat", (route) =>
      route.fulfill({ json: { ok: true, reply: "OK.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: HERO_ACTIONS } }),
    );
    await page.getByRole("textbox", { name: "Type your order" }).fill("Two cheeseburger sets");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await command(request, s.deviceToken, {
      sessionId: s.sessionId,
      type: "addToCart",
      args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } },
      source: "text",
      utteranceSeq: 1,
    });
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "requestCheckout", args: {}, source: "text", utteranceSeq: 2 });
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    const strip = page.locator("[data-action-strip]");
    const confirm = strip.locator('li[data-action-tool="confirmCheckout"]');
    await expect(confirm).toContainText("You tapped Yes, pay now");

    for (const vp of [SIZES[2], SIZES[3]]) {
      await page.setViewportSize(vp);
      const fonts = await strip.evaluate((el) => [...new Set([...el.querySelectorAll("*")].map((x) => getComputedStyle(x).fontFamily))]);
      expect(fonts.filter((f) => /mono/i.test(f)), `${vp.width}: no monospace`).toEqual([]);
      const title = confirm.locator(":scope > *").first();
      expect(await title.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight])).toEqual(["16px", "700"]);
      const tech = confirm.locator(":scope > *").nth(1);
      await expect(tech).toHaveText(/^confirmCheckout ✓ \d+ ms$/);
      expect(await textLines(tech), `${vp.width}: technical line`).toBe(1);
      expect(await tech.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe("tabular-nums");
      await expect(confirm.locator(":scope > *").nth(2)).toHaveText("Needs your tap or a new 'yes'");
    }
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.86" } });

  test("after payment the end card's buttons stay in view when the window narrows (#1 14)", async ({ page, request }) => {
    const s = await start(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } });
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await page.getByRole("button", { name: "출력 안 함" }).click();
    await expect(page.locator("[data-demo-end]")).toBeVisible();
    // Reached at 1440, then the window narrows. "What the AI did" stays in the third column at every size (#1 E), so
    // nothing comes back under the phone to push the end card down.
    for (const vp of [SIZES[1], SIZES[0]]) {
      await page.setViewportSize(vp);
      await expect(page.locator("[data-demo-check] [data-action-strip]"), `${vp.width}: strip under the phone`).toHaveCount(0);
      const places = page.getByRole("navigation", { name: "Try another place" });
      await expect(places.getByRole("link", { name: "Pizza shop" }), `${vp.width}: [Pizza shop]`).toBeInViewport({ ratio: 1 });
    }
  });
});
