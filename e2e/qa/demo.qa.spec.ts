import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { command, kioskRoot, openScenarios } from "../helpers";
import { HERO_ACTIONS, RAIL_ACTIONS } from "../recordedActions";
import { DEMO, DEMO_GUIDE, qaState, type Findings } from "./checks";

// UI QA of /demo (docs/UX.md screen map D1–D3) at the judge viewports in docs/UI_QA.md. The checks measure the
// intro and the phone column; the kiosk half is the scaled canvas, whose sizes kiosk.qa.spec.ts checks at full size,
// so here it is judged on the screenshots. States are reached through the real UI and the API, never the model.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  locale: "en-US",
  // Its own address for the dev server's per-IP limit (240 a minute), shared with the other QA specs otherwise.
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.11" },
});

async function check(page: Page, info: TestInfo, state: string, before?: () => Promise<void>, viewports = VIEWPORTS, profile = DEMO) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await before?.();
    const f: Findings = await qaState(page, info, profile, state);
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
    // No page scroll at any judge viewport (the step's layout rule).
    const scroll = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect.soft(scroll, `${state} ${vp.width}x${vp.height}: page scroll`).toEqual({ x: 0, y: 0 });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

/** R-009, I-134: the whole [Yes, pay now], not a sliver of it, at every judge viewport. */
const payInView = (page: Page) => async () => {
  await expect(page.getByRole("button", { name: "Yes, pay now" })).toBeInViewport({ ratio: 1 });
};

test("D1 on a phone: the laptop note comes first (14-final:1)", async ({ page }, info) => {
  await page.goto("/demo");
  await check(page, info, "D1-intro-phone", async () => {
    await expect(page.locator("[data-demo-narrow-note]")).toBeInViewport();
  }, [{ width: 390, height: 844 }]);
});

test("D1 to D3", async ({ page, request }, info) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "D1-intro");

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
  await check(page, info, "D2-empty");

  // C3: Live refuses (here a mocked 429, no model call), and the text input comes forward with one sentence.
  await page.route("**/api/live-token", (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: { code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." } },
    }),
  );
  const mic = page.locator("[data-voice-state]");
  await expect(mic).toHaveAccessibleName(/Tap to talk/);
  expect((await mic.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(88);
  await mic.click();
  await expect(page.getByText("Voice is busy right now. Please type instead.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await check(page, info, "D2-voice-fallback");
  await page.unroute("**/api/live-token");

  const ai = (type: string, args: object, utteranceSeq: number) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq });
  await ai("setDineOption", { option: "eat_in" }, 1);
  // A new line per viewport, so each screenshot (taken first) falls inside its own 2 s highlight.
  const drinks = ["zero_cola", "cider", "cola"];
  let seq = 1;
  await check(page, info, "D2-ai-highlight", async () => {
    const drink = drinks[seq - 1];
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } }, seq++);
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(seq - 1);
    await expect(page.locator("[data-kiosk-subtitle]")).toContainText("AI added: Cheeseburger set");
  });

  // Larger text from the phone's app bar, as on a real phone (15-judge-fixes:2): only the phone half grows.
  await page.getByRole("button", { name: "Language and text size: English" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("switch", { name: "Larger text" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("button", { name: "Close" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-large-text", "true");
  await check(page, info, "D2-large-text", undefined, [VIEWPORTS[0]]);
  await page.getByRole("button", { name: "Language and text size: English" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("switch", { name: "Larger text" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("button", { name: "Close" }).click();
  await expect(phoneScreen(page)).not.toHaveAttribute("data-large-text", "true");

  await ai("requestCheckout", {}, seq++);
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
  await check(page, info, "D2-confirm", payInView(page));

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  await expect(page.locator("[data-kiosk-step]")).toContainText("Kiosk: payment. Tap 카드 (Card)");
  // The card stand-in sits under the kiosk half; the phone half has no button that pays (15-judge-fixes:2).
  await check(page, info, "D2-payment", async () => {
    await expect(page.locator("[data-card-reader]").getByRole("button", { name: "Kiosk: insert card (demo)" })).toBeInViewport({ ratio: 1 });
    await expect(phoneScreen(page).getByRole("button", { name: /card/i })).toHaveCount(0);
  });

  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await check(page, info, "D3-done");
});

test.describe(() => {
  // Its own address: this test adds sessions on top of the two above (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.27" } });

  test("D1 to D3 with the airport rail ticket machine", async ({ page, request }, info) => {
    await page.goto("/demo?k=airport_rail");
    await expect(page.getByRole("link", { name: /SKYLINE AIRPORT RAIL/ })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
    await check(page, info, "D1-intro-rail");

    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
    await check(page, info, "D2-rail-empty");

    // A new line per viewport, so each screenshot falls inside its own 2 s highlight.
    const passengers = ["adult", "child", "senior"];
    let seq = 0;
    await check(page, info, "D2-rail-added", async () => {
      const passenger = passengers[seq];
      await command(request, s.deviceToken, {
        sessionId: s.sessionId,
        type: "addToCart",
        args: { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: [passenger] } },
        source: "voice",
        utteranceSeq: ++seq,
      });
      await expect(page.getByRole("region", { name: "Your tickets" }).locator("li")).toHaveCount(seq);
    });

    await command(request, s.deviceToken, {
      sessionId: s.sessionId,
      type: "requestCheckout",
      args: {},
      source: "voice",
      utteranceSeq: ++seq,
    });
    await expect(page.getByRole("heading", { name: "Please check your tickets" })).toBeVisible();
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
    await check(page, info, "D2-rail-confirm", payInView(page));

    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
    await check(page, info, "D2-rail-payment");

    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
    await page.getByRole("button", { name: "출력 안 함" }).click();
    await expect(page.locator("[data-demo-end]")).toBeVisible();
    await check(page, info, "D3-rail-done");
  });
});

test.describe(() => {
  // Its own address: choosing a scenario creates a second session (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.29" } });

  test("D2 with the scenario guide open and a scenario half done", async ({ page, request }, info) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
    const guide = page.locator("[data-scenario-guide]");
    await openScenarios(page);
    await check(page, info, "D2-scenarios-list");
    await check(page, info, "D2-scenarios-list-guide", undefined, VIEWPORTS, DEMO_GUIDE);

    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.locator('[data-scenario="sunja-lunch"]').click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    for (const drink of ["zero_cola", "cider"]) {
      await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } });
    }
    await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(1);
    await check(page, info, "D2-scenario-half");
    await check(page, info, "D2-scenario-half-guide", undefined, VIEWPORTS, DEMO_GUIDE);
  });
});

test.describe(() => {
  // Its own address: choosing a scenario creates a second session (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.31" } });

  test("D2 with 'What the AI did' open after a scenario step, and collapsed", async ({ page, request }, info) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "dine");
    const guide = page.locator("[data-scenario-guide]");
    await openScenarios(page);
    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.locator('[data-scenario="sunja-lunch"]').click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });

    // Step 1 sent from its chip; the test answers /api/chat (no model) with what the agent did, as the route would.
    await page.route("**/api/chat", async (route) => {
      for (const a of HERO_ACTIONS) {
        await command(request, s.deviceToken, { sessionId: s.sessionId, type: a.tool, args: a.args, source: "text", utteranceSeq: 1 });
      }
      await route.fulfill({ json: { ok: true, reply: "Added two cheeseburger sets.", status: "ordering", cart: [], total: 0, cartVersion: 2, actions: HERO_ACTIONS } });
    });
    await guide.locator('[data-scenario-step="0"]').getByRole("button").click();
    await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(1);
    const strip = page.locator("[data-action-strip]");
    await expect(strip.getByRole("listitem")).toHaveCount(HERO_ACTIONS.length);
    await check(page, info, "D2-actions-open", undefined, [VIEWPORTS[0]]);

    await strip.getByRole("button", { name: /What the AI did/ }).click();
    await check(page, info, "D2-actions-collapsed", undefined, [VIEWPORTS[1]]);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.60" } });

  // A Korean typed order on the English screens, through a choice tap (16-judge-r3-fixes:0, I-271). The tap sends the
  // English label "Cider"; the reply stays Korean. No model: the route stands in for the agent and checks the message.
  test("D2: a Korean typed order on English screens, through a choice tap", async ({ page, request }, info) => {
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");

    const sent: string[] = [];
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON() as { message: string };
      sent.push(body.message);
      const ai = (type: string, args: object) =>
        command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: sent.length });
      let reply = "음료는 무엇으로 드릴까요?";
      if (sent.length === 1) {
        await ai("offerChoices", {
          templateId: "pick_option",
          choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "zero_cola" }, { kind: "option", id: "cider" }],
        });
      } else {
        await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["cider"] } });
        reply = "치즈버거 세트에 감자튀김 L과 사이다를 담았어요.";
      }
      await route.fulfill({ json: { ok: true, reply, status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } });
    });
    await page.getByRole("textbox", { name: "Type your order" }).fill("치즈버거 세트 하나, 감자튀김은 큰 걸로 주세요");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Which one would you like?" })).toBeVisible();
    await check(page, info, "D2-ko-on-en-choices", undefined, [VIEWPORTS[0]]);

    await page.locator("[data-choices]").getByRole("button", { name: /^Cider/ }).click();
    await expect(page.locator('[data-bubble="model"]').last()).toContainText("사이다를 담았어요");
    expect(sent[1]).toBe("Cider");
    await check(page, info, "D2-ko-on-en-after-tap", undefined, [VIEWPORTS[0], VIEWPORTS[1]]);
  });
});

/** Opens /demo?k=<kioskId>, starts, opens the guide and chooses a scenario; returns the scenario's own session. */
async function chooseScenario(page: Page, kioskId: string, scenarioId: string) {
  await page.goto(`/demo?k=${kioskId}`);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", /^(dine|talk)$/);
  const guide = page.locator("[data-scenario-guide]");
  await openScenarios(page);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.locator(`[data-scenario="${scenarioId}"]`).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await expect(guide.locator("[data-scenario-step]").first()).toBeVisible();
  return { s, guide };
}

test.describe(() => {
  // Its own address: two sessions per scenario (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.32" } });

  test("D2 scenario finished at the confirm card, guide and strip side by side", async ({ page, request }, info) => {
    const { s, guide } = await chooseScenario(page, "malo", "sunja-lunch");
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    for (const drink of ["zero_cola", "cider"]) {
      await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink], side: ["fries_l"] } });
    }
    await ai("requestCheckout", {});
    await expect(guide.locator("[data-scenario-your-turn]")).toBeVisible();
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirm");
    // R-009: the guide column must not push the total and [Yes, pay now] off screen.
    await check(page, info, "D2-scenario-finished", payInView(page));
    // The viewport loop re-lays out the guide and loses its scroll; a user who stayed at one size still has the
    // "Your turn" line in view (it scrolled there when the last step ticked), so show that (I-160, R-010).
    const yourTurn = guide.locator("[data-scenario-your-turn]");
    await check(page, info, "D2-scenario-finished-guide", () => yourTurn.scrollIntoViewIfNeeded(), VIEWPORTS, DEMO_GUIDE);

    // After payment the "Your turn" line points on (I-144, added in 11-hardening:1; R-003).
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    // While paying only the card is left (I-242, 14-final:10; R-003).
    await expect(yourTurn).toHaveText("Your turn: insert the card at the kiosk.");
    await check(page, info, "D2-scenario-paying-guide", () => yourTurn.scrollIntoViewIfNeeded(), VIEWPORTS, DEMO_GUIDE);
    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await expect(yourTurn).toHaveText("Paid. Choose another scenario to try more.");
    await check(page, info, "D3-scenario-paid-guide", () => yourTurn.scrollIntoViewIfNeeded(), VIEWPORTS, DEMO_GUIDE);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.33" } });

  test("D2 Play it for me: sending, stopped, failed", async ({ page, request }, info) => {
    const { s, guide } = await chooseScenario(page, "malo", "halal");
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    const play = guide.getByRole("button", { name: "Play it for me" });

    // Sending: /api/chat held open (no model), so the guide shows the step it is on and [Stop].
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/chat", async (route) => {
      await held;
      await route.fulfill({ json: { ok: true, reply: "OK.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } });
    });
    await play.click();
    await expect(guide.getByText("Step 1 of 1: sending it to the AI…")).toBeVisible();
    await check(page, info, "D2-play-sending-guide", undefined, [VIEWPORTS[0]], DEMO_GUIDE);

    await guide.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(guide.getByText("Stopped. You can carry on yourself.")).toBeVisible();
    release();
    await check(page, info, "D2-play-stopped-guide", undefined, [VIEWPORTS[0]], DEMO_GUIDE);

    // Failed: the agent answers but the step's check never holds within 20 s.
    await page.unroute("**/api/chat");
    await page.route("**/api/chat", (route) =>
      route.fulfill({ json: { ok: true, reply: "OK.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } }),
    );
    await play.click();
    await expect(guide.getByText("This step didn't go as expected. You can type it yourself or try again.")).toBeVisible({ timeout: 30_000 });
    await check(page, info, "D2-play-failed-guide", undefined, [VIEWPORTS[0], VIEWPORTS[1]], DEMO_GUIDE);
    await check(page, info, "D2-play-failed", undefined, [VIEWPORTS[0]]);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.34" } });

  test("D2 scenario guide on the airport rail ticket machine: list, finished, strip", async ({ page, request }, info) => {
    const { s, guide } = await chooseScenario(page, "airport_rail", "mei-tickets");
    await page.route("**/api/chat", async (route) => {
      await command(request, s.deviceToken, {
        sessionId: s.sessionId,
        type: "addToCart",
        args: { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } },
        source: "text",
        utteranceSeq: 1,
      });
      await route.fulfill({ json: { ok: true, reply: "Added.", status: "ordering", cart: [], total: 0, cartVersion: 1, actions: RAIL_ACTIONS } });
    });
    await guide.locator('[data-scenario-step="0"]').getByRole("button").click();
    await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(1);
    await expect(page.locator("[data-action-strip]").getByRole("listitem")).toHaveCount(RAIL_ACTIONS.length);
    await check(page, info, "D2-rail-scenario-half", undefined, VIEWPORTS);
    await check(page, info, "D2-rail-scenario-half-guide", undefined, VIEWPORTS, DEMO_GUIDE);

    let seq = 1;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: ++seq });
    await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: ["child"] } });
    await ai("requestCheckout", {});
    await expect(guide.locator("[data-scenario-your-turn]")).toBeVisible();
    await check(page, info, "D2-rail-scenario-finished", payInView(page), VIEWPORTS);

    await guide.getByRole("button", { name: "All scenarios" }).click();
    await check(page, info, "D2-rail-scenarios-list-guide", undefined, [VIEWPORTS[0]], DEMO_GUIDE);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.35" } });

  test("D2 scenario guide on the learned pizza kiosk: finished at the review", async ({ page, request }, info) => {
    const judge = [VIEWPORTS[0]];
    const { s, guide } = await chooseScenario(page, "doughhouse", "learned-pizza");
    await check(page, info, "D2-learned-scenario-start", undefined, judge, DEMO_GUIDE);
    const widget = page.locator("[data-learned-widget]");
    let seq = 0;
    const ai = (type: string, args: object = {}) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await expect(widget).toHaveAttribute("data-bridge-ok", "true");
    await ai("addToCart", { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } });
    await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(1);
    await ai("requestCheckout");
    await expect(guide.locator("[data-scenario-your-turn]")).toContainText("finish and pay on the kiosk itself");
    await check(page, info, "D2-learned-scenario-finished", undefined, judge);
    await check(page, info, "D2-learned-scenario-finished-guide", undefined, judge, DEMO_GUIDE);
  });
});

test("D1 to D3 with the learned pizza kiosk", async ({ page, request }, info) => {
  const judge = [VIEWPORTS[0]];
  await page.goto("/demo?k=doughhouse");
  await expect(page.getByRole("link", { name: /Doughhouse/ })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
  await check(page, info, "D1-intro-learned", undefined, judge);

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  const widget = page.locator("[data-learned-widget]");
  let seq = 0;
  const ai = (type: string, args: object = {}) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });

  await ai("setDineOption", { option: "eat_in" });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await ai("addToCart", { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } });
  await expect(page.getByRole("region", { name: "Your order" }).getByText("Pepperoni", { exact: true })).toBeVisible();
  await expect(widget).toContainText("Added: Pepperoni");
  await check(page, info, "D2-learned-added", undefined, judge);

  await ai("requestCheckout");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await check(page, info, "D3-learned-confirm", undefined, judge);
});
