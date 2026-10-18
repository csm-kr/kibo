import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { command } from "./helpers";
import { HERO_ACTIONS, MIXED_ACTIONS } from "./recordedActions";

// The /demo frame (issue #1 batch E, mockup A "Clean studio"): a slim top bar with the place tabs over D1, D2 and D3,
// and three white column cards. Measured in CSS px at the judge sizes; no model calls (/api/chat is answered by the test).

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
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.90" },
});

interface DemoSession {
  sessionId: string;
  deviceToken: string;
  kioskToken: string;
}

async function start(page: Page, kioskId = "malo"): Promise<DemoSession> {
  await page.goto(`/demo?k=${kioskId}`);
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  return (await (await created).json()) as DemoSession;
}

const bar = (page: Page) => page.locator("[data-demo-topbar]");
const places = (page: Page) => bar(page).getByRole("navigation", { name: "Places" });

async function expectBar(page: Page, current: string, at: string) {
  await expect(bar(page).getByRole("img", { name: "KIBO" }), at).toBeVisible();
  await expect(bar(page).getByText("Live demo", { exact: true }), at).toBeVisible();
  // The two direct kiosks only; a learned kiosk gets a tab only while it is the current place (I-426).
  const hrefs = {
    "Burger shop": "/demo?k=malo",
    "Airport rail": "/demo?k=airport_rail",
  };
  await expect(places(page).getByRole("link"), at).toHaveText(Object.keys(hrefs));
  for (const [name, href] of Object.entries(hrefs)) {
    const tab = places(page).getByRole("link", { name, exact: true });
    await expect(tab, `${at}: ${name}`).toHaveAttribute("href", href);
    if (name === current) await expect(tab, `${at}: ${name} selected`).toHaveAttribute("aria-current", "page");
    else await expect(tab, `${at}: ${name} not selected`).not.toHaveAttribute("aria-current", /.+/);
  }
  await expect(bar(page).getByRole("link", { name: "How it works" }), at).toHaveAttribute("href", "/#how");
}

test("D1, D2 and D3 share one top bar: KIBO, Live demo, the place tabs with the current place selected, How it works (#1 E)", async ({ page, request }) => {
  await page.goto("/demo?k=airport_rail");
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  await expectBar(page, "Airport rail", "D1");
  const d1 = await bar(page).boundingBox();

  // Keyboard: the tabs are in the tab order, before the page's own content.
  await page.locator("body").focus();
  const reached: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
  }
  expect(reached).toEqual(expect.arrayContaining(["Burger shop", "Airport rail"]));

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  const s = (await (await created).json()) as DemoSession;
  await expect(page.locator("[data-phone-screen]")).toBeVisible();
  await expectBar(page, "Airport rail", "D2");
  // U5: the bar does not move between the screens.
  expect(await bar(page).boundingBox()).toEqual(d1);

  let seq = 0;
  const ai = (type: string, args: object) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: ["adult"] } });
  await ai("requestCheckout", {});
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await expectBar(page, "Airport rail", "D3");
  expect(await bar(page).boundingBox()).toEqual(d1);
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.91" } });

  test("a place tab starts that place fresh; with order lines not yet paid it asks first (#1 E, N5)", async ({ page, request }) => {
    // An empty order: straight to the other place's start, as Try another place does.
    await start(page);
    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await expect(page).toHaveURL(/\/demo\?k=airport_rail$/);
    await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible();

    // Lines in the order: one plain question first; keeping the order changes nothing.
    const s = await start(page);
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await command(request, s.deviceToken, {
      sessionId: s.sessionId,
      type: "addToCart",
      args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } },
      source: "voice",
      utteranceSeq: 1,
    });
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);
    await places(page).getByRole("link", { name: "Airport rail" }).click();
    const ask = page.getByRole("dialog", { name: "Start over at Airport rail?" });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("This order is cleared.");
    // The safe answer has focus (N5).
    await expect(ask.getByRole("button", { name: "Keep this order" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/\/demo\?k=malo$/);
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await ask.getByRole("button", { name: "Keep this order" }).click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/\/demo\?k=malo$/);

    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await ask.getByRole("button", { name: "Start over" }).click();
    await expect(page).toHaveURL(/\/demo\?k=airport_rail$/);
    await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible();
  });

  test("after payment a place tab asks nothing: the order is done (#1 E)", async ({ page, request }) => {
    const s = await start(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } });
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await expect(page.locator("[data-demo-end]")).toBeVisible();
    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/demo\?k=airport_rail$/);
  });
});

/** The column cards (kiosk, phone, scenarios and AI): box, look and the centre of each caption row's caption. */
function columns(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-demo-column]")].map((el) => {
      const r = el.getBoundingClientRect();
      const c = el.querySelector("[data-column-caption]")?.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        caption: c ? c.top + c.height / 2 : null,
        background: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
      };
    }),
  );
}

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.92" } });

  test("three white column cards start on one line, their numbered captions on one line, at every judge size (#1 E, R-022)", async ({ page, request }) => {
    const s = await start(page);
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await expect(page.getByRole("heading", { name: "Kiosk · unchanged" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your phone" })).toBeVisible();
    for (const vp of SIZES) {
      await page.setViewportSize(vp);
      const at = `${vp.width}x${vp.height}`;
      const cols = await columns(page);
      expect(cols, `${at}: three columns, beside the phone at every size`).toHaveLength(3);
      expect(cols[0].left < cols[1].left && cols[1].left < cols[2].left, `${at}: kiosk, phone, then the third column`).toBe(true);
      for (const [i, c] of cols.entries()) {
        expect(Math.abs(c.top - cols[0].top), `${at}: column ${i + 1} top`).toBeLessThanOrEqual(1);
        expect(Math.abs(c.bottom - cols[0].bottom), `${at}: column ${i + 1} bottom`).toBeLessThanOrEqual(1);
        expect(c.caption, `${at}: column ${i + 1} caption`).not.toBeNull();
        expect(Math.abs(c.caption! - cols[0].caption!), `${at}: column ${i + 1} caption centre`).toBeLessThanOrEqual(1);
        expect(c.background, `${at}: column ${i + 1} is white`).toBe("rgb(255, 255, 255)");
        expect(c.radius, `${at}: column ${i + 1} radius (rounded-sheet)`).toBe("26px");
        expect(c.shadow, `${at}: column ${i + 1} shadow (shadow-card)`).toContain("rgba(21, 23, 28, 0.06)");
      }
      // The numbers say the order to look in: the kiosk, the phone, then what to try and what the AI did.
      await expect(page.locator("[data-demo-column] [data-column-number]")).toHaveText(["1", "2", "3"]);
      const scroll = await page.evaluate(() => [
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      ]);
      expect(scroll, `${at}: page scroll`).toEqual([0, 0]);
    }
  });
});

const third = (page: Page) => page.locator("[data-scenario-guide]");
const tab = (page: Page, name: "Scenarios" | "What the AI did") => third(page).getByRole("tab", { name: new RegExp(`^${name}`) });

/** Answers the next /api/chat with these tool calls, made through the API as the agent would (no model). */
async function answerChat(page: Page, request: APIRequestContext, s: DemoSession, actions: typeof HERO_ACTIONS, seq: number) {
  await page.unroute("**/api/chat");
  await page.route("**/api/chat", async (route) => {
    for (const a of actions) {
      if (a.code !== "ok" || a.tool !== "addToCart") continue;
      await command(request, s.deviceToken, { sessionId: s.sessionId, type: a.tool, args: a.args, source: "text", utteranceSeq: seq });
    }
    await route.fulfill({
      json: {
        ok: true,
        reply: "Added one Cheeseburger set with Zero cola and no pickles, and one Cheeseburger set with Cider. Would you like anything else?",
        status: "ordering",
        cart: [],
        total: 0,
        cartVersion: 2,
        actions,
      },
    });
  });
}

async function say(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Type your order" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.93" } });

  test("the third column is one panel with two tabs that switch by keyboard (#1 E)", async ({ page }) => {
    await start(page);
    const list = third(page).getByRole("tablist");
    await expect(list.getByRole("tab")).toHaveText(["Scenarios", "What the AI did"]);
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "What the AI did")).toHaveAttribute("aria-selected", "false");
    // Roving focus: only the selected tab is in the tab order.
    await expect(tab(page, "Scenarios")).toHaveAttribute("tabindex", "0");
    await expect(tab(page, "What the AI did")).toHaveAttribute("tabindex", "-1");
    const scenarios = page.getByRole("tabpanel", { name: "Scenarios" });
    await expect(scenarios).toBeVisible();
    await expect(scenarios.locator("[data-scenario]").first()).toBeVisible();

    await tab(page, "Scenarios").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "What the AI did")).toBeFocused();
    await expect(tab(page, "What the AI did")).toHaveAttribute("aria-selected", "true");
    const ai = page.getByRole("tabpanel", { name: /^What the AI did/ });
    await expect(ai).toBeVisible();
    await expect(ai).toContainText("Gemini decides; the KIBO server checks every action");
    await expect(scenarios).toBeHidden();
    // It wraps around, and Home and End go to the ends.
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Scenarios")).toBeFocused();
    await expect(scenarios).toBeVisible();
    await page.keyboard.press("End");
    await expect(tab(page, "What the AI did")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "What the AI did")).toBeFocused();
    await expect(ai).toBeVisible();
    // Tab leaves the tablist for the panel's content (the rows scroll with the keyboard, I-067).
    await page.keyboard.press("Tab");
    await expect(page.locator("#demo-actions")).toBeFocused();

    // A control scrolled to the top of either panel stays 8px clear of the tabs' 56px targets (UI_QA target gaps).
    for (const [name, area] of [["Scenarios", "#demo-scenario-guide"], ["What the AI did", "#demo-actions"]] as const) {
      await tab(page, name).click();
      const gap = await page.evaluate((sel) => {
        const row = document.querySelector("[data-scenario-guide] [role=tablist]")!.getBoundingClientRect();
        return document.querySelector(sel)!.getBoundingClientRect().top - row.bottom;
      }, area);
      expect(gap, `${name}: the scroll area's top under the tabs`).toBeGreaterThanOrEqual(8);
    }
  });

  test("the first tool call of an order switches to 'What the AI did' once; switching back sticks (#1 E)", async ({ page, request }) => {
    const s = await start(page);
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await expect(page.locator('[data-phone-screen="talk"]')).toBeVisible();
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");

    // A reply with no tool call leaves the scenarios as they are.
    await page.route("**/api/chat", (route) =>
      route.fulfill({ json: { ok: true, reply: "Hello.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } }),
    );
    await say(page, "Hello");
    await expect(page.locator('[data-bubble="model"]')).toHaveCount(1);
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");

    // The first tool call: the judge sees the AI's work without looking for it.
    await answerChat(page, request, s, HERO_ACTIONS, 1);
    await say(page, "Two cheeseburger sets. One without pickles; drinks zero cola and cider.");
    await expect(tab(page, "What the AI did")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "What the AI did").locator("[data-action-count]")).toHaveText("2");
    await expect(page.getByRole("tabpanel", { name: /^What the AI did/ }).getByRole("listitem")).toHaveCount(2);

    // Back to the scenarios: later tool calls in this order never take it away again.
    await tab(page, "Scenarios").click();
    await answerChat(page, request, s, MIXED_ACTIONS, 2);
    await say(page, "And more");
    await expect(tab(page, "What the AI did").locator("[data-action-count]")).toHaveText(String(2 + MIXED_ACTIONS.length));
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");

    // A fresh order (a chosen scenario): a step sent from the guide keeps the guide open, so the next step is one tap
    // away; the AI tab's count still shows the new calls (design-qa round 2, follow-up a).
    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.locator('[data-scenario="sunja-lunch"]').click();
    const next = (await (await created).json()) as DemoSession;
    await command(request, next.deviceToken, { sessionId: next.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await expect(tab(page, "What the AI did").locator("[data-action-count]")).toHaveCount(0);
    await answerChat(page, request, next, HERO_ACTIONS, 1);
    await third(page).locator('[data-scenario-step="0"]').getByRole("button").click();
    await expect(tab(page, "What the AI did").locator("[data-action-count]")).toHaveText("2");
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");
    await expect(third(page).locator('[data-scenario-step="1"]').getByRole("button")).toBeVisible();

    // Typed or spoken in the same order, the first tool call still switches once.
    await answerChat(page, request, next, MIXED_ACTIONS, 2);
    await say(page, "And more");
    await expect(tab(page, "What the AI did")).toHaveAttribute("aria-selected", "true");
  });

  test("the user's own tap on [Yes, pay now] is listed but does not switch the tab: it is not the AI's work (#1 E)", async ({ page, request }) => {
    const s = await start(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } });
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await expect(tab(page, "What the AI did").locator("[data-action-count]")).toHaveText("1");
    await expect(tab(page, "Scenarios")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe(() => {
  test("right after the hero order, the order's total and the first 'What the AI did' row are both fully in view (#1 E, #1 18, R-023)", async ({ page, request }) => {
    for (const [i, vp] of SIZES.entries()) {
      // A fresh order at each size, each from its own address (R-005).
      await page.setExtraHTTPHeaders({ "X-Forwarded-For": `192.0.2.${94 + i}` });
      await page.setViewportSize(vp);
      const s = await start(page);
      await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
      await expect(page.locator('[data-phone-screen="talk"]')).toBeVisible();
      await answerChat(page, request, s, HERO_ACTIONS, 1);
      await say(page, "Two cheeseburger sets. One without pickles; drinks zero cola and cider.");
      await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(2);
      const at = `${vp.width}x${vp.height}`;
      const summary = page.locator("[data-cart-summary]");
      const total = page.getByRole("region", { name: "Your order" }).getByText("₩13,800", { exact: true });
      await expect(async () => {
        await expect((await summary.isVisible()) ? summary : total, `${at}: summary pill or card total`).toBeInViewport({ ratio: 1, timeout: 1_000 });
      }).toPass({ timeout: 10_000 });
      const row = page.getByRole("tabpanel", { name: /^What the AI did/ }).getByRole("listitem").first();
      await expect(row, `${at}: first row of What the AI did`).toBeInViewport({ ratio: 1 });
      await page.unroute("**/api/chat");
    }
  });
});

test("D1: two equal place cards side by side, the direct kiosks only, descriptions on one line, no dark outlines, a balanced headline (#1 6, I-414, I-426)", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  for (const vp of SIZES) {
    await page.setViewportSize(vp);
    const at = `${vp.width}x${vp.height}`;
    const m = await page.evaluate(() => {
      const intro = document.querySelector('main[data-demo="intro"]')!;
      const cards = [...intro.querySelectorAll<HTMLElement>("[data-place-card]")];
      const boxes = cards.map((c) => c.getBoundingClientRect());
      // Per card: its top (cards of one row share it), its description's top, its size, its picture's size, and
      // whether its title takes one line (a name never wraps).
      const each = cards.map((c, i) => {
        const title = c.querySelector("img + span > span")!;
        const lh = parseFloat(getComputedStyle(title).lineHeight);
        const img = c.querySelector("img")!.getBoundingClientRect();
        return {
          top: Math.round(boxes[i].top),
          persona: c.querySelector("[data-place-persona]")!.getBoundingClientRect().top,
          w: boxes[i].width,
          h: boxes[i].height,
          img: { w: img.width, h: img.height },
          titleLines: Math.round(title.getBoundingClientRect().height / lh),
        };
      });
      // No card or link leads to a learned kiosk or its /learn run from the default D1 (I-426).
      const learnedLinks = [...intro.querySelectorAll("a")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => /doughhouse|bunsik|^\/learn/.test(h));
      // Dark 2px outlines: borders of 2px or more in a dark colour (I-165).
      const dark = [...intro.querySelectorAll<HTMLElement>("*")].filter((el) => {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.borderTopWidth) < 2 || cs.borderTopStyle === "none") return false;
        const [r, g, bl] = (cs.borderTopColor.match(/\d+/g) ?? []).map(Number);
        return (r + g + bl) / 3 < 80;
      }).length;
      // Headline lines that hold a single word ("kiosk." alone).
      const h1 = intro.querySelector("h1")!;
      const lone: string[] = [];
      for (const block of h1.querySelectorAll("span")) {
        const text = block.firstChild as Text;
        const lines = new Map<number, string[]>();
        let i = 0;
        for (const word of (text.textContent ?? "").split(" ")) {
          const range = document.createRange();
          range.setStart(text, i);
          range.setEnd(text, i + word.length);
          const top = Math.round(range.getBoundingClientRect().top);
          lines.set(top, [...(lines.get(top) ?? []), word]);
          i += word.length + 1;
        }
        if (lines.size > 1) for (const words of lines.values()) if (words.length === 1) lone.push(words[0]);
      }
      return {
        // Under the top bar D1 still fits the judge sizes whole, as it did before the frame.
        hidden: intro.scrollHeight - intro.clientHeight,
        cards: cards.length,
        names: cards.map((c) => c.querySelector("img + span > span")!.textContent?.trim()),
        each,
        learnedLinks,
        dark,
        wrap: getComputedStyle(h1).textWrapStyle,
        lone,
      };
    });
    expect(m.cards, at).toBe(2);
    expect(m.names, at).toEqual(["Burger shop", "Airport rail"]);
    expect(m.learnedLinks, `${at}: links to learned kiosks`).toEqual([]);
    expect(m.hidden, `${at}: D1 cut under the fold`).toBeLessThanOrEqual(0);
    if (vp.width >= 900) {
      const [a, b] = m.each;
      // Side by side: one row of two cards.
      expect(a.top === b.top, `${at}: card tops ${m.each.map((e) => e.top).join(", ")}`).toBe(true);
      expect(Math.abs(a.persona - b.persona), `${at}: description tops of the row ${a.persona}, ${b.persona}`).toBeLessThanOrEqual(1);
      for (const e of m.each) {
        expect(Math.abs(e.w - a.w), `${at}: card widths ${m.each.map((x) => x.w).join(", ")}`).toBeLessThanOrEqual(1);
        expect(Math.abs(e.h - a.h), `${at}: card heights ${m.each.map((x) => x.h).join(", ")}`).toBeLessThanOrEqual(1);
        expect(Math.abs(e.img.h - a.img.h), `${at}: picture heights`).toBeLessThanOrEqual(1);
        expect(Math.abs(e.img.w / e.img.h - 4 / 3), `${at}: pictures 4:3`).toBeLessThanOrEqual(0.02);
        expect(e.titleLines, `${at}: a place name on one line`).toBe(1);
      }
    }
    expect(m.dark, `${at}: dark 2px outlines`).toBe(0);
    expect(m.wrap, `${at}: headline`).toBe("balance");
    expect(m.lone, `${at}: headline words alone on a line`).toEqual([]);
  }
  // The secondary button follows the phone design: tinted, no border (I-165).
  const phone = page.getByRole("button", { name: "Try it on this screen" });
  expect(await phone.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopWidth])).toEqual(["rgb(238, 240, 253)", "0px"]);
});
