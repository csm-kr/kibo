import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pt } from "@/lib/i18n/phone";
import { command, expectPhoneEdgeFaded, hintsCut, kioskRoot, openScenarios } from "../helpers";
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

/** #1 11, I-179: while the cart is empty, the first "Try saying" example is whole above the dock. */
const firstExampleInView = (page: Page) => async () => {
  await expect(phoneScreen(page).getByRole("region", { name: "Try saying" }).getByRole("button").first()).toBeInViewport({ ratio: 1 });
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
  await page.getByRole("button", { name: "Try it on this screen" }).click();
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

  const ai = (type: string, args: object, utteranceSeq: number, source = "voice") =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source, utteranceSeq });
  await ai("setDineOption", { option: "eat_in" }, 1);
  let seq = 1;
  // The order is typed into the phone half, and the test answers /api/chat (no model) with what the agent would do,
  // as e2e/qa/assistant.qa.spec.ts does, so D3's Touch vs talk counts this order's real messages (#1 item 16).
  const turns: { type: string; args: object; reply: string; status: string }[] = [];
  await page.route("**/api/chat", async (route) => {
    const turn = turns.shift()!;
    await ai(turn.type, turn.args, ++seq, "text");
    await route.fulfill({ json: { ok: true, reply: turn.reply, status: turn.status, cart: [], total: 0, cartVersion: 0, actions: [] } });
  });
  const say = async (text: string, turn: (typeof turns)[number]) => {
    turns.push(turn);
    await page.getByRole("textbox", { name: "Type your order" }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator('[data-bubble="model"]').last()).toContainText(turn.reply);
  };
  // A new line per viewport, so each screenshot (taken first) falls inside its own 2 s highlight.
  const drinks = [
    ["zero_cola", "zero cola", "Zero cola"],
    ["cider", "cider", "Cider"],
    ["cola", "cola", "Cola"],
  ];
  let lines = 0;
  await check(page, info, "D2-ai-highlight", async () => {
    const [drink, said, name] = drinks[lines++];
    await say(`One cheeseburger set with ${said}`, {
      type: "addToCart",
      args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: [drink] } },
      reply: `Added one Cheeseburger set with ${name}.`,
      status: "ordering",
    });
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(lines);
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

  await say("That's all. I'll pay.", { type: "requestCheckout", args: {}, reply: "Please check your order.", status: "confirming" });
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
  await check(page, info, "D2-confirm", payInView(page));

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  await expect(page.locator("[data-kiosk-step]")).toContainText("Payment: tap 카드 (Card)");
  // The card stand-in sits under the kiosk half; the phone half has no button that pays (15-judge-fixes:2).
  await check(page, info, "D2-payment", async () => {
    await expect(page.locator("[data-card-reader]").getByRole("button", { name: "Kiosk: insert card (demo)" })).toBeInViewport({ ratio: 1 });
    await expect(phoneScreen(page).getByRole("button", { name: /card/i })).toHaveCount(0);
  });

  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  // Touch vs talk counts this order's own messages to the AI, so the D3 screenshots must not say 0 (#1 item 16).
  expect(Number(await page.locator('[data-compare="sentences"]').textContent())).toBeGreaterThanOrEqual(1);
  // The Touch vs talk card ran on under the phone's edge with nothing to say it scrolls (#1 2-phone).
  await check(page, info, "D3-done", () => expectPhoneEdgeFaded(page, "D3"));
});

test.describe(() => {
  // Its own address: this test adds sessions on top of the two above (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.27" } });

  test("D1 to D3 with the airport rail ticket machine", async ({ page, request }, info) => {
    await page.goto("/demo?k=airport_rail");
    await expect(page.getByRole("link", { name: /SKYLINE AIRPORT RAIL/ })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
    await check(page, info, "D1-intro-rail");

    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Try it on this screen" }).click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
    await check(page, info, "D2-rail-empty", firstExampleInView(page));

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
    await page.getByRole("button", { name: "Try it on this screen" }).click();
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
    await page.getByRole("button", { name: "Try it on this screen" }).click();
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
    // A step sent from the guide keeps the guide open (the next step is one tap away); the AI tab counts the calls.
    const aiTab = guide.getByRole("tab", { name: /^What the AI did/ });
    await expect(guide.getByRole("tab", { name: /^Scenarios/ })).toHaveAttribute("aria-selected", "true");
    await expect(aiTab.locator("[data-action-count]")).toHaveText(String(HERO_ACTIONS.length));
    await aiTab.click();
    const strip = page.locator("[data-action-strip]");
    await expect(strip.getByRole("listitem")).toHaveCount(HERO_ACTIONS.length);
    await check(page, info, "D2-actions-open", undefined, [VIEWPORTS[0]]);

    // Back on the Scenarios tab, the other tab keeps the count.
    await openScenarios(page);
    await check(page, info, "D2-actions-collapsed", undefined, [VIEWPORTS[1]]);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.60" } });

  // A Korean typed order on the English screens, through a choice tap (16-judge-r3-fixes:0, I-271). Since I-404 the
  // phone's screens follow the Korean line, so the choices and the tapped label are Korean too, and the tap keeps them;
  // the reply stays Korean. No model: the route stands in for the agent and checks the message.
  test("D2: a Korean typed order on English screens switches the phone to Korean, through a choice tap", async ({ page, request }, info) => {
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Try it on this screen" }).click();
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
    await expect(phoneScreen(page)).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { name: "어떤 걸로 드릴까요?" })).toBeVisible();
    await check(page, info, "D2-ko-typed-choices", undefined, [VIEWPORTS[0]]);

    await page.locator("[data-choices]").getByRole("button", { name: /^사이다/ }).click();
    await expect(page.locator('[data-bubble="model"]').last()).toContainText("사이다를 담았어요");
    expect(sent[1]).toBe("사이다");
    await expect(phoneScreen(page)).toHaveAttribute("lang", "ko");
    await check(page, info, "D2-ko-typed-after-tap", undefined, [VIEWPORTS[0], VIEWPORTS[1]]);
  });
});

/** Opens /demo, starts and chooses "Eat here" on the phone, so the phone is on its talk screen with an empty cart. */
async function startTalk(page: Page) {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await phoneScreen(page).getByRole("button", { name: "Eat here" }).click();
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  return s;
}

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.85" } });

  // #1 11: on a fresh D2 the empty "Your order ₩0" card pushed "Try saying" under the dock at 1280×720 and 1366×768,
  // so a judge saw no example sentence at all.
  test("D2 talk with an empty cart: the first example sentence fully in view", async ({ page }, info) => {
    await startTalk(page);
    await check(page, info, "D2-talk-empty", async () => {
      await firstExampleInView(page)();
      await expectPhoneEdgeFaded(page, "D2 empty"); // "Is this halal?" was cut 29 of 30px at 1366 (#1 2-phone)
    }, [VIEWPORTS[1], { width: 1366, height: 768 }, VIEWPORTS[0], VIEWPORTS[2]]);
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.81" } });

  // #1 18: right after the hero order the card's total sat under the dock at every laptop size (1440×900 too). The
  // one-line cart summary above the dock keeps the count and total in view while the card is out of view.
  test("D2 right after the hero order: the cart summary or the card's total fully in view", async ({ page, request }, info) => {
    const sizes = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 789 }, VIEWPORTS[0]];
    for (const [i, vp] of sizes.entries()) {
      // A fresh order at each size, each from its own address, so --repeat-each stays under 10 new sessions a
      // minute per address (R-005, R-018).
      await page.setExtraHTTPHeaders({ "X-Forwarded-For": `192.0.2.${81 + i}` });
      await page.setViewportSize(vp);
      const s = await startTalk(page);
      // The hero sentence answered by the test with the agent's recorded actions (no model).
      await page.route("**/api/chat", async (route) => {
        for (const a of HERO_ACTIONS) {
          await command(request, s.deviceToken, { sessionId: s.sessionId, type: a.tool, args: a.args, source: "text", utteranceSeq: 1 });
        }
        await route.fulfill({
          json: {
            ok: true,
            reply: "Added one Cheeseburger set with Zero cola and no pickles, and one Cheeseburger set with Cider. Would you like anything else?",
            status: "ordering",
            cart: [],
            total: 0,
            cartVersion: 2,
            actions: HERO_ACTIONS,
          },
        });
      });
      await page.getByRole("textbox", { name: "Type your order" }).fill("Two cheeseburger sets. One without pickles; drinks zero cola and cider.");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator('[data-bubble="model"]')).toBeVisible();
      await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(2);
      const summary = page.locator("[data-cart-summary]");
      const total = page.getByRole("region", { name: "Your order" }).getByText("₩13,800", { exact: true });
      await check(page, info, "D2-hero-summary", async () => {
        await expect(async () => {
          await expect((await summary.isVisible()) ? summary : total).toBeInViewport({ ratio: 1, timeout: 1_000 });
        }).toPass({ timeout: 10_000 });
        await expectPhoneEdgeFaded(page, `D2 hero ${vp.width}x${vp.height}`);
      }, [vp]);
      await page.unroute("**/api/chat");
    }
  });
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.88" } });

  // #1 8 (I-133): the rail hint read "e.g. Two adults to City Cente" at 1280×720. Every kiosk's hint (MALO, the rail
  // ticket machine, the learned pizza kiosk) at the narrowest judge size, with normal and larger text, in both languages.
  test("D2 at 1280×720: every kiosk's input hint fits beside [Send], English and Korean, normal and larger text", async ({ page }, info) => {
    const keys = ["inputPlaceholder", "ticketPlaceholder", "learnedPlaceholder"] as const;
    await page.setViewportSize(VIEWPORTS[1]);
    await startTalk(page);
    const en = page.getByRole("textbox", { name: "Type your order" });
    expect(await hintsCut(en, keys.map((k) => pt(k, "en"))), "English").toEqual([]);

    await page.getByRole("button", { name: "Language and text size: English" }).click();
    const sheet = page.getByRole("dialog", { name: "Language and text size" });
    await sheet.getByRole("switch", { name: "Larger text" }).click();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(phoneScreen(page)).toHaveAttribute("data-large-text", "true");
    expect(await hintsCut(en, keys.map((k) => pt(k, "en"))), "English, larger text").toEqual([]);

    await page.getByRole("button", { name: "Language and text size: English" }).click();
    await page.getByRole("dialog", { name: "Language and text size" }).getByRole("button", { name: /^한국어/ }).click();
    const ko = page.getByRole("textbox", { name: "주문을 글자로 입력" });
    expect(await hintsCut(ko, keys.map((k) => pt(k, "ko"))), "Korean, larger text").toEqual([]);
    await check(page, info, "D2-hint-ko-large", undefined, [VIEWPORTS[1]]);
  });
});

/** Opens /demo?k=<kioskId>, starts, opens the guide and chooses a scenario; returns the scenario's own session. */
async function chooseScenario(page: Page, kioskId: string, scenarioId: string) {
  await page.goto(`/demo?k=${kioskId}`);
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Try it on this screen" }).click();
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
    // Each step is sent from its chip, and the test answers /api/chat (no model) with what the agent would do, so D3's
    // Touch vs talk counts the three messages (#1 item 16).
    let lineIds: string[] = [];
    await page.route("**/api/chat", async (route) => {
      const { message } = route.request().postDataJSON() as { message: string };
      let status = "ordering";
      if (message.startsWith("Two cheeseburger sets")) {
        for (const selections of [{ drink: ["zero_cola"], ingredients: ["no_pickles"] }, { drink: ["cider"] }]) {
          const r = await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections });
          lineIds = (r.cart as { lineId: string }[]).map((l) => l.lineId);
        }
      } else if (message.startsWith("Make both fries large")) {
        for (const lineId of lineIds) await ai("updateCart", { lineId, changes: { selections: { side: ["fries_l"] } } });
      } else {
        await ai("requestCheckout", {});
        status = "confirming";
      }
      await route.fulfill({ json: { ok: true, reply: "Done.", status, cart: [], total: 0, cartVersion: 0, actions: [] } });
    });
    for (const [step, done] of [[0, 1], [1, 2], [2, 3]]) {
      await guide.locator(`[data-scenario-step="${step}"]`).getByRole("button").click();
      await expect(guide.locator('[data-scenario-step][data-done="true"]')).toHaveCount(done);
    }
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
    expect(Number(await page.locator('[data-compare="sentences"]').textContent())).toBeGreaterThanOrEqual(1);
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

    // Failed: the agent answers (with a tool call) but the step's check never holds within 20 s.
    await page.unroute("**/api/chat");
    await page.route("**/api/chat", (route) =>
      route.fulfill({ json: { ok: true, reply: "OK.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: HERO_ACTIONS.slice(0, 1) } }),
    );
    await play.click();
    await expect(guide.getByText("This step didn't go as expected. You can type it yourself or try again.")).toBeVisible({ timeout: 30_000 });
    // A played step is the guide's own turn: the guide stays open, so its line stays readable (design-qa round 2, 27).
    await expect(guide.getByRole("tab", { name: /^Scenarios/ })).toHaveAttribute("aria-selected", "true");
    await expect(guide.getByRole("tab", { name: /^What the AI did/ }).locator("[data-action-count]")).toHaveText("1");
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
    // A step sent from the guide keeps the guide open; the AI tab shows the call when chosen.
    await check(page, info, "D2-rail-scenario-half-guide", undefined, VIEWPORTS, DEMO_GUIDE);
    await guide.getByRole("tab", { name: /^What the AI did/ }).click();
    await expect(page.locator("[data-action-strip]").getByRole("listitem")).toHaveCount(RAIL_ACTIONS.length);
    await check(page, info, "D2-rail-scenario-half", undefined, VIEWPORTS);

    let seq = 1;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: ++seq });
    // Back to the guide.
    await openScenarios(page);
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
  await page.getByRole("button", { name: "Try it on this screen" }).click();
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

  // D3 first appears at the smallest judge size, then the window grows; at the end it narrows from 1440 to 1280 (#1 25).
  await page.setViewportSize({ width: 1280, height: 720 });
  await ai("requestCheckout");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirmLearned");
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  const sizes = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, VIEWPORTS[0], VIEWPORTS[2]];
  await check(page, info, "D3-learned-confirm", learnedEndInView(page), sizes);
  await page.setViewportSize({ width: 1280, height: 720 });
  await learnedEndInView(page)();
});

/**
 * #1 25: the learned kiosk's end card. Its "never pays" line and [Try again] are whole, above the phone's bottom fade
 * and 8px clear of the app bar's buttons (UI_QA target gaps); what does not fit below them lies under the fade.
 */
const learnedEndInView = (page: Page) => async () => {
  const end = page.locator("[data-demo-end]");
  await expect(end.getByText(pt("learnedDemoEnd", "en"))).toBeInViewport({ ratio: 1 });
  await expect(end.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      end.evaluate((card) => {
        const area = card.closest("[data-phone-scroll]")!;
        const fade = area.querySelector(":scope > [data-scroll-fade]");
        const shown = fade !== null && parseFloat(getComputedStyle(fade).opacity) > 0.9;
        const floor = shown ? fade.getBoundingClientRect().top : area.getBoundingClientRect().bottom;
        const button = [...card.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Try again")!.getBoundingClientRect();
        const bar = Math.max(...[...document.querySelectorAll("[data-phone-screen] header button")].map((b) => b.getBoundingClientRect().bottom));
        return { gapToAppBar: button.top - bar >= 8, aboveFade: button.bottom <= floor + 0.5 };
      }),
    )
    .toEqual({ gapToAppBar: true, aboveFade: true });
  await expectPhoneEdgeFaded(page, "D3 learned");
};
