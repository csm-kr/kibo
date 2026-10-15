import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { pt } from "@/lib/i18n/phone";
import { claim, command, hintsCut, warmPhone } from "../helpers";
import { PHONE, qaState, type Findings } from "./checks";

// UI QA of the phone screens (docs/UX.md screen map P2–P7, PX) at the phone viewports in docs/UI_QA.md, each with
// the 320px reflow check. States are reached through the real UI and the API (kiosk token from a session created
// here, device token from the phone's own claim), never by calling the model or mocking components.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  // Reflow width (WCAG 1.4.10): every check, not only the horizontal-scroll one.
  { width: 320, height: 700 },
];

const STRICT = process.env.QA_ALL === "1";

// Its own address: this spec creates many sessions, and on the shared one it hit the 10 a minute limit (R-005, I-068).
test.use({ viewport: VIEWPORTS[0], locale: "en-US", isMobile: true, hasTouch: true, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.56" } });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function check(page: Page, info: TestInfo, state: string, viewports = VIEWPORTS, each?: () => Promise<void>) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await each?.();
    const f: Findings = await qaState(page, info, PHONE, state, { reflow: true });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const screenOf = (page: Page) => page.locator("[data-phone-screen]");

/** The cart summary as seen: its text without the screen-reader-only words, and how many lines it takes (#1 9). */
const summaryLook = (page: Page) =>
  page.locator("[data-cart-summary]").evaluate((el) => {
    const tops = new Set<number>();
    let text = "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      // Screen-reader-only words sit in a 1px box (sr-only, also from a container query).
      if ((n.parentElement?.getBoundingClientRect().width ?? 0) <= 2) continue;
      text += n.textContent;
      const range = document.createRange();
      range.selectNodeContents(n);
      if (n.textContent?.trim()) for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
    }
    return { text: text.trim(), lines: tops.size };
  });

/** A kiosk session from the API and the phone opened on its claim URL. */
async function openPhone(page: Page, request: APIRequestContext) {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  const phone = (type: string, args: object, extra: { source?: string; utteranceSeq?: number; cartVersion?: number } = {}) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, source: "voice", ...extra });
  const kiosk = (type: string) => command(request, created.kioskToken, { sessionId: created.sessionId, type, source: "touch" });
  return { ...created, deviceToken, phone, kiosk };
}

const cheeseSet = (drink: string, extra: Record<string, string[]> = {}) => ({
  itemId: "cheese_burger",
  variant: "set",
  qty: 1,
  selections: { drink: [drink], ...extra },
});

test("phone path: start to order number", async ({ page, request }, info) => {
  const s = await openPhone(page, request);
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "start");
  await check(page, info, "P-start");

  await page.getByRole("button", { name: "Start" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "mic");
  await check(page, info, "P1-mic-hint");

  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "dine");
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await check(page, info, "P2-dine");

  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByText("Nothing in your order yet.")).toBeVisible();
  await check(page, info, "P3-empty");

  await s.phone("addToCart", cheeseSet("zero_cola", { ingredients: ["no_pickles"] }), { utteranceSeq: 1 });
  await s.phone("addToCart", cheeseSet("cider"), { utteranceSeq: 1 });
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(2);
  await check(page, info, "P3-two-lines");

  await s.phone("offerChoices", {
    templateId: "pick_item",
    choices: [
      { kind: "item", id: "bulgogi_burger" },
      { kind: "item", id: "double_cheese_burger" },
      { kind: "item", id: "classic_burger" },
    ],
  });
  await expect(page.getByRole("heading", { name: "Which one would you like?" })).toBeVisible();
  await check(page, info, "P3-choices");

  // The dessert offer: prices from menu data and a [No thanks] (14-final:1).
  await s.phone("offerChoices", { templateId: "upsell", choices: [{ kind: "item", id: "soft_cone" }, { kind: "item", id: "apple_pie" }] });
  await expect(page.getByRole("button", { name: "No thanks" })).toBeVisible();
  await check(page, info, "P3-upsell");

  // /api/chat answers with its real rate-limit reply here, so the check never reaches the model.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests." } },
    }),
  );
  await page.getByRole("button", { name: "Make both fries large." }).click();
  await expect(page.getByText(/^Too many requests\. Please try again in a moment\./)).toBeVisible();
  await check(page, info, "P3-error");
  await page.unroute("**/api/chat");

  const checkout = await s.phone("requestCheckout", {}, { utteranceSeq: 2 });
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  expect(checkout.status).toBe("confirming");
  // The text field opened on P1 ([Type instead]) stays open for the order (UX C3); close it for P4's own look.
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeVisible();
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Type your order" })).toHaveCount(0);
  // The total and the whole [Yes, pay now] at every phone size, 320×700 included (I-134, R-009).
  await check(page, info, "P4-confirm", VIEWPORTS, async () => {
    await expect(page.getByRole("button", { name: "Yes, pay now" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByText("Total", { exact: true })).toBeInViewport({ ratio: 1 });
  });

  // [Type] brings the text input forward on P4 for a typed "yes".
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await check(page, info, "P4-confirm-typing", [VIEWPORTS[0], VIEWPORTS[3]], async () => {
    await expect(page.getByRole("button", { name: "Yes, pay now" })).toBeInViewport({ ratio: 1 });
  });

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "pay");
  await check(page, info, "P5-pay");

  await s.kiosk("cardAction");
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "done");
  await check(page, info, "P6-done");
});

test("P-lang: the language picker, then the phone with the AI in Japanese (14-final:4)", async ({ page, request }, info) => {
  const s = await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");

  await page.getByRole("button", { name: "Language and text size: English" }).click();
  const picker = page.getByRole("dialog", { name: "Language and text size" });
  await expect(picker.getByRole("button", { name: /^English/ })).toBeFocused();
  await check(page, info, "P-lang-picker");

  await picker.getByRole("button", { name: /^日本語/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator("[data-ai-language]")).toHaveAttribute("data-ai-language", "ja");
  // The screens stay English; the cart shows the kiosk's Korean name with the English one under it.
  await s.phone("addToCart", cheeseSet("zero_cola"), { utteranceSeq: 1 });
  const order = page.getByRole("region", { name: "Your order" });
  await expect(order.getByText("치즈버거 세트", { exact: true })).toBeVisible();
  await expect(order.getByText("Cheeseburger set", { exact: true })).toBeVisible();
  await check(page, info, "P3-ja", [VIEWPORTS[0], VIEWPORTS[3]]);

  await s.phone("requestCheckout", {}, { utteranceSeq: 2 });
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();
  await check(page, info, "P4-confirm-ja", [VIEWPORTS[0], VIEWPORTS[3]], async () => {
    await expect(page.getByRole("button", { name: "はい、支払います" })).toBeInViewport({ ratio: 1 });
  });
  await page.getByRole("button", { name: "はい、支払います" }).click();
  await expect(page.getByRole("heading", { name: "キオスクにカードを入れてください" })).toBeVisible();
  await check(page, info, "P5-pay-ja", [VIEWPORTS[0]]);
});

/**
 * Stands in for Gemini Live with no network: the token route answers, and the socket answers the setup message
 * with setupComplete, which is all "Listening…" needs. Returns a function that releases the held token reply.
 */
async function fakeLive(page: Page) {
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/live-token", async (route) => {
    await held;
    await route.fulfill({
      json: { ok: true, token: "fake", model: "gemini-3.8-live", expiresAt: Date.now() + 180_000, voiceSeconds: 600 },
    });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    let setup = false;
    ws.onMessage(() => {
      if (setup) return;
      setup = true;
      ws.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  return release;
}

const micButton = (page: Page) => page.locator("[data-voice-state]");

/** The mic button: ≥ 88px tall with its state in words (docs/UI_QA.md "Phone targets"), and a ≥ 2px focus ring. */
async function checkMicButton(page: Page, label: RegExp) {
  const mic = micButton(page);
  await expect(mic).toHaveAccessibleName(label);
  expect((await mic.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(88);
  // Reach it by keyboard, so :focus-visible applies as it would for a keyboard user.
  await mic.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(mic).toBeFocused();
  const outline = await mic.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
  expect(outline).toBeGreaterThanOrEqual(2);
}

const pulseRunning = (page: Page) =>
  page.evaluate(() => document.getAnimations().some((a) => a instanceof CSSAnimation && a.animationName === "kibo-listen" && a.playState === "running"));

test("P1 to P3 by voice: connecting, listening, stop", async ({ page, request }, info) => {
  const release = await fakeLive(page);
  await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Turn on the microphone" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "dine");
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "connecting");
  await checkMicButton(page, /Connecting…/);
  await check(page, info, "P2-mic-connecting");

  release();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "listening");
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await checkMicButton(page, /Listening…/);
  // The pulse runs only while listening, and not at all with reduced motion (checks.ts makes that an H rule too).
  expect(await pulseRunning(page)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await pulseRunning(page)).toBe(false);
  await page.emulateMedia({ reducedMotion: null });
  await check(page, info, "P3-listening");

  await page.getByRole("switch", { name: "AI voice" }).click();
  await expect(page.getByRole("switch", { name: "AI voice" })).toHaveAttribute("aria-checked", "false");
  await micButton(page).click();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "off");
  await checkMicButton(page, /Tap to talk/);
  expect(await pulseRunning(page)).toBe(false);
});

test("P3: voice gives way to text when it is busy", async ({ page, request }, info) => {
  await page.route("**/api/live-token", (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: { code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." } },
    }),
  );
  await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");

  await micButton(page).click();
  await expect(page.getByText("Voice is busy right now. Please type instead.")).toBeVisible();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "error");
  const input = page.getByRole("textbox", { name: "Type your order" });
  await expect(input).toBeFocused();
  await expect(input).toBeEnabled();
  await check(page, info, "P3-voice-fallback");
});

test("P3: noise hint, voice reconnecting, then text after the retries fail", async ({ page, request }, info) => {
  // A fake Live socket the test can talk through and drop; the first token comes at once, later ones wait.
  let socket: { send(m: string): void; close(): void } | null = null;
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  let tokens = 0;
  await page.route("**/api/live-token", async (route) => {
    tokens++;
    if (tokens === 1) {
      return route.fulfill({
        json: { ok: true, token: "fake", model: "gemini-3.8-live", expiresAt: Date.now() + 180_000, voiceSeconds: 600 },
      });
    }
    await held;
    await route.fulfill({ status: 500, json: { ok: false, error: { code: "INTERNAL", message: "Something went wrong." } } });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    let setup = false;
    ws.onMessage(() => {
      if (setup) return;
      setup = true;
      socket = ws;
      ws.send(JSON.stringify({ setupComplete: {} }));
    });
  });

  await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await micButton(page).click();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "listening");

  // UX "Noise": two heard turns in a row that run no tool.
  for (let i = 0; i < 2; i++) {
    socket!.send(JSON.stringify({ serverContent: { inputTranscription: { text: "mm hmm" } } }));
    socket!.send(JSON.stringify({ serverContent: { outputTranscription: { text: "Sorry, could you say that again?" } } }));
    socket!.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  }
  await expect(page.getByText("Having trouble? Try typing or tapping a button.")).toBeVisible();
  await check(page, info, "P3-voice-noise");

  // PX: the Live socket drops; the phone fetches a new token and says so on the mic button.
  socket!.close();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "reconnecting");
  await checkMicButton(page, /Reconnecting…/);
  await check(page, info, "P3-voice-reconnecting");

  // Two failed retries: text takes over with a plain reason and the input focused.
  release();
  await expect(page.getByText("Voice isn't working right now. Please type instead.")).toBeVisible();
  await expect(micButton(page)).toHaveAttribute("data-voice-state", "error");
  await expect(page.getByRole("textbox", { name: "Type your order" })).toBeFocused();
  await check(page, info, "P3-voice-failed");
});

test("PX: the session stream drops, and the same phone continues after a reload", async ({ page, request, baseURL }, info) => {
  const s = await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await s.phone("addToCart", cheeseSet("cider"), { utteranceSeq: 1 });
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

  // From now on the stream sends one snapshot and ends, with a long retry, so EventSource stays "connecting".
  await page.route("**/api/session/*/events", async (route) => {
    const ctrl = new AbortController();
    const res = await fetch(new URL(new URL(route.request().url()).pathname, baseURL), { signal: ctrl.signal });
    const reader = res.body!.getReader();
    let text = "";
    while (!text.includes("\n\n")) text += new TextDecoder().decode((await reader.read()).value);
    ctrl.abort();
    await route.fulfill({ contentType: "text/event-stream", body: `retry: 3600000\n${text.slice(0, text.indexOf("\n\n") + 2)}` });
  });
  // "Phone screen off / disconnected": reopening on the same phone keeps the token, the screen and the cart.
  await page.reload();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Reconnecting…" })).toBeVisible();
  await check(page, info, "PX-reconnecting", [VIEWPORTS[0], VIEWPORTS[3]]);
});

test("P1 in an in-app browser: copy the link or order here by typing", async ({ browser, request }, info) => {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[0],
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
  });
  const page = await ctx.newPage();
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const { claimUrl } = (await res.json()) as { claimUrl: string };
  await page.goto(claimUrl);
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "inapp");
  // The claim waits, so the link the user copies still connects in Safari or Chrome.
  expect(page.url()).toContain("#t=");
  await check(page, info, "P1-in-app");

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Copied|Couldn't copy/ })).toBeVisible();
  await page.getByRole("button", { name: "Order here by typing" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "start");
  await page.getByRole("button", { name: "Start" }).click();
  // The user already chose typing, so no microphone hint; the banner stays.
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "dine");
  await expect(page.getByRole("note")).toHaveText(/Microphones often don't work in this app/);
  await check(page, info, "P2-in-app-banner", [VIEWPORTS[0], VIEWPORTS[3]]);
  await ctx.close();
});

test("P3 in Korean with larger text: the dock while typing, and the cart summary when the card is out of view (14-final:1)", async ({
  browser,
  request,
}, info) => {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[1], locale: "ko-KR", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("kibo.phone.largeText", "on"));
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  const phone = (type: string, args: object) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, source: "voice", utteranceSeq: 1 });
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "글자로 입력할게요" }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  await phone("addToCart", { itemId: "bulgogi_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });

  // The keyboard is up: the mic is 56px; the screenshot keeps the field's focus on purpose.
  const input = page.getByRole("textbox", { name: "주문을 글자로 입력" });
  await input.focus();
  await expect(page.locator("[data-voice-state]")).toHaveAttribute("data-compact", "true");
  await check(page, info, "P3-typing-ko-large", [VIEWPORTS[1], VIEWPORTS[3]], () => input.focus());

  // A long cart scrolled back to the top: the card's total is out of view, and the one-line summary above the dock
  // keeps it in view. (Choices hide the summary since 15-judge-fixes:2, so the cart itself pushes the total down.)
  for (const itemId of ["cheese_burger", "double_cheese_burger", "classic_burger", "fries_m"]) {
    await phone("addToCart", { itemId, variant: "single", qty: 1, selections: {} });
  }
  await expect(page.getByRole("region", { name: "내 주문" }).locator("li")).toHaveCount(5);
  await page.locator("[data-phone-scroll]").evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(page.locator("[data-cart-summary]")).toBeVisible();
  await check(page, info, "P3-cart-summary-ko-large", [VIEWPORTS[1], VIEWPORTS[3]], async () => {
    await page.locator("[data-phone-scroll]").evaluate((el) => el.scrollTo({ top: 0 }));
    // One line, count and total only; screen readers still hear "내 주문" (#1 9).
    await expect(page.locator("[data-cart-summary]")).toBeVisible();
    expect(await summaryLook(page)).toMatchObject({ text: expect.stringMatching(/^5개 · [\d,]+원$/), lines: 1 });
    await expect(page.locator("[data-cart-summary]")).toHaveAccessibleName(/^내 주문 5개 · [\d,]+원$/);
  });
  await ctx.close();
});

test("P3 at 360×800 with larger text: the AI's reply and its choices stay above the dock (15-judge-fixes:2)", async ({
  browser,
  request,
}, info) => {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[1], locale: "en-US", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("kibo.phone.largeText", "on"));
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");

  // The judge's order (no model): the route adds the set and offers dessert, as the agent would, then replies.
  await page.route("**/api/chat", async (route) => {
    const ai = (type: string, args: object) =>
      command(request, deviceToken, { sessionId: created.sessionId, type, args, source: "text", utteranceSeq: 1 });
    await ai("addToCart", { itemId: "bulgogi_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["cider"] } });
    await ai("offerChoices", { templateId: "upsell", choices: [{ kind: "item", id: "soft_cone" }, { kind: "item", id: "apple_pie" }] });
    // As with the real model, the choices reach the phone before the reply (I-270).
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      json: {
        ok: true,
        // One word longer than before, so the reply and its choices no longer fit together at 360×800 with larger
        // text: the last choice was left half under the dock (I-270).
        reply: "Added one Bulgogi burger set with Fries (L) and Cider. Would you like a dessert too?",
        status: "ordering",
        cart: [],
        total: 0,
        cartVersion: 0,
        actions: [],
      },
    });
  });
  await page.getByRole("textbox", { name: "Type your order" }).fill("A bulgogi burger set with large fries and a cider");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "No thanks" })).toBeVisible();

  // The last choice and the reply's start are whole on screen, not under the dock, and no summary covers them.
  const shown = async () => {
    await expect(page.getByRole("button", { name: "No thanks" })).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-bubble="model"]').last()).toBeInViewport();
    await expect(page.locator("[data-cart-summary]")).toHaveCount(0);
  };
  await shown();
  await check(page, info, "P3-reply-choices-large", [VIEWPORTS[1]], shown);
  await ctx.close();
});

test("P3 at 360×800 and 320×700 with larger text: the cart summary is one line, the count and total (#1 9)", async ({
  browser,
  request,
}, info) => {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[1],
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.86" },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("kibo.phone.largeText", "on"));
  const s = await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");

  // The hero order (no model): the route adds the two sets, then replies; the reply pushes the card below the dock.
  await page.route("**/api/chat", async (route) => {
    await s.phone("addToCart", cheeseSet("zero_cola", { ingredients: ["no_pickles"] }), { source: "text", utteranceSeq: 1 });
    await s.phone("addToCart", cheeseSet("cider"), { source: "text", utteranceSeq: 1 });
    await route.fulfill({
      json: {
        ok: true,
        reply: "Added one Cheeseburger set with Zero cola and no pickles, and one Cheeseburger set with Cider. Would you like anything else?",
        status: "ordering",
        cart: [],
        total: 0,
        cartVersion: 2,
        actions: [],
      },
    });
  });
  await page.getByRole("textbox", { name: "Type your order" }).fill("Two cheeseburger sets. One without pickles; drinks zero cola and cider.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator('[data-bubble="model"]')).toBeVisible();
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();

  // It wrapped to two lines right under the card's own header (audit P3-two-lines-L-360x800). Back to the messages
  // at each size, as after the reply: the previous size's checks leave the list elsewhere.
  const summary = page.locator("[data-cart-summary]");
  await check(page, info, "P3-cart-summary-large", [VIEWPORTS[1], VIEWPORTS[3]], async () => {
    await page.locator("[data-phone-scroll]").evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(summary).toBeVisible();
    expect(await summaryLook(page)).toEqual({ text: "2 items · ₩13,800", lines: 1 });
    await expect(summary).toHaveAccessibleName("Your order 2 items · ₩13,800");
    const scroll = await page.locator("[data-phone-scroll]").boundingBox();
    expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(scroll!.y + scroll!.height);
  });

  // Normal text: the whole label where it fits (390 wide); at 360 wide the pill is too narrow for it, so the count and
  // total stay on one line and the title goes to screen readers.
  await page.getByRole("button", { name: "Language and text size: English" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("switch", { name: "Larger text" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("button", { name: "Close" }).click();
  for (const [vp, text] of [
    [VIEWPORTS[0], "Your order 2 items · ₩13,800"],
    [VIEWPORTS[1], "2 items · ₩13,800"],
  ] as const) {
    await page.setViewportSize(vp);
    await page.locator("[data-phone-scroll]").evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(summary).toBeVisible();
    expect(await summaryLook(page), `${vp.width}x${vp.height}`).toEqual({ text, lines: 1 });
    await expect(summary).toHaveAccessibleName("Your order 2 items · ₩13,800");
  }
  await ctx.close();
});

// Every kiosk's text-field hint (MALO, the airport rail ticket machine, the learned pizza kiosk), in both languages.
const HINT_KEYS = ["inputPlaceholder", "ticketPlaceholder", "learnedPlaceholder"] as const;

test("P3: every kiosk's input hint fits beside [Send] with larger text, in English and Korean (#1 8, I-133, R-019)", async ({
  browser,
  request,
}, info) => {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[1],
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.87" },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("kibo.phone.largeText", "on"));
  await openPhone(page, request);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");

  // English at 360×800 ("e.g. Cheeseburger" with "set" cut, 15-judge-fixes:6), Korean down to 320×700 (R-019).
  const en = page.getByRole("textbox", { name: "Type your order" });
  await expect(en).toHaveAttribute("placeholder", pt("inputPlaceholder", "en"));
  expect(await hintsCut(en, HINT_KEYS.map((k) => pt(k, "en"))), "English at 360×800").toEqual([]);
  await check(page, info, "P3-hint-large", [VIEWPORTS[1]]);

  await page.getByRole("button", { name: "Language and text size: English" }).click();
  await page.getByRole("dialog", { name: "Language and text size" }).getByRole("button", { name: /^한국어/ }).click();
  const ko = page.getByRole("textbox", { name: "주문을 글자로 입력" });
  for (const vp of [VIEWPORTS[1], VIEWPORTS[3]]) {
    await page.setViewportSize(vp);
    expect(await hintsCut(ko, HINT_KEYS.map((k) => pt(k, "ko"))), `Korean at ${vp.width}x${vp.height}`).toEqual([]);
  }
  await check(page, info, "P3-hint-ko-large", [VIEWPORTS[3]]);
  await ctx.close();
});

test.describe(() => {
  // Its own address: two sessions per language (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.58" } });

  // With an AI-only language the choice question and the fixed labels follow it; names stay from menu data
  // (16-judge-r3-fixes:0, I-271). A drink question and the dessert offer, at 390×844 and at 360×800 with larger text.
  const AI_LANGS = [
    { lang: "ja", drink: "どれにしますか？", upsell: "デザートもいかがですか？", decline: "いりません" },
    { lang: "zh", drink: "您要哪一种？", upsell: "要不要再来份甜点？", decline: "不用了" },
    { lang: "es", drink: "¿Cuál prefiere?", upsell: "¿Quiere también un postre?", decline: "No, gracias" },
  ];
  for (const t of AI_LANGS) {
    test(`P3 with the AI in ${t.lang}: choice questions and [No thanks] in it (16-judge-r3-fixes:0)`, async ({ browser, request }, info) => {
      for (const large of [false, true]) {
        const vp = large ? VIEWPORTS[1] : VIEWPORTS[0];
        const ctx = await browser.newContext({
          viewport: vp,
          locale: "en-US",
          isMobile: true,
          hasTouch: true,
          extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.58" },
        });
        const page = await ctx.newPage();
        await page.addInitScript(
          ([lang, big]) => {
            localStorage.setItem("kibo.phone.aiLang", lang);
            if (big) localStorage.setItem("kibo.phone.largeText", "on");
          },
          [t.lang, large] as const,
        );
        const s = await openPhone(page, request);
        await page.getByRole("button", { name: "Start" }).click();
        await page.getByRole("button", { name: "Type instead" }).click();
        await page.getByRole("button", { name: "Eat here" }).click();
        await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
        await expect(page.locator("[data-ai-language]")).toHaveAttribute("data-ai-language", t.lang);
        await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();
        const suffix = large ? "-large" : "";

        await s.phone("offerChoices", {
          templateId: "pick_option",
          choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "zero_cola" }, { kind: "option", id: "cider" }],
        });
        await expect(page.getByRole("heading", { name: t.drink })).toBeVisible();
        await check(page, info, `P3-${t.lang}-drink${suffix}`, [vp]);

        await s.phone("addToCart", cheeseSet("cider"), { utteranceSeq: 1 });
        await s.phone("offerChoices", { templateId: "upsell", choices: [{ kind: "item", id: "soft_cone" }, { kind: "item", id: "apple_pie" }] });
        await expect(page.getByRole("heading", { name: t.upsell })).toBeVisible();
        await expect(page.getByRole("button", { name: t.decline })).toBeVisible();
        await check(page, info, `P3-${t.lang}-upsell${suffix}`, [vp]);
        await ctx.close();
      }
    });
  }
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.59" } });

  // Each size in its own page from the start: keepInView runs on a reply, not on a resize (a phone never resizes).
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) test(`P3: an allergy question ends on [Call staff] at ${vp.width} wide (16-judge-r3-fixes:1)`, async ({ page, request }, info) => {
    await page.setViewportSize(vp);
    const s = await openPhone(page, request);
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Type instead" }).click();
    await page.getByRole("button", { name: "Eat here" }).click();
    await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
    await s.phone("addToCart", { itemId: "bulgogi_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } }, { utteranceSeq: 1 });

    // No model: the route does what the allergy instructions ask (allergens from the data, then the staff offer).
    await page.route("**/api/chat", async (route) => {
      await command(request, s.deviceToken, {
        sessionId: s.sessionId,
        type: "offerChoices",
        args: { templateId: "ask_staff", choices: [{ kind: "staff", id: "staff" }] },
        source: "text",
        utteranceSeq: 2,
      });
      await route.fulfill({
        json: {
          ok: true,
          reply:
            "The kiosk data lists wheat, egg, soy and beef for the Bulgogi burger. Peanut and milk are not listed, but cross-contact is not known, so I can't say it is safe.",
          status: "ordering",
          cart: [],
          total: 0,
          cartVersion: 1,
          actions: [],
        },
      });
    });
    await page.getByRole("textbox", { name: "Type your order" }).fill("I have a peanut and milk allergy. Is the bulgogi burger safe?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Shall I call staff to check for you?" })).toBeVisible();
    await expect(page.locator("[data-choices]").getByRole("button", { name: "Call staff" })).toBeVisible();
    await expect(page.getByRole("button", { name: "No thanks" })).toBeVisible();
    // The whole [Call staff] above the dock, with the text field open (R-009).
    await expect(page.locator("[data-choices]").getByRole("button", { name: "Call staff" })).toBeInViewport({ ratio: 1 });
    await check(page, info, "P3-ask-staff", [vp]);

    await page.locator("[data-choices]").getByRole("button", { name: "Call staff" }).click();
    await expect(page.locator("[data-choices]")).toHaveCount(0);
  });
});

test("P7: someone else is using this kiosk", async ({ page, request }, info) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const { sessionId, claimUrl } = (await res.json()) as { sessionId: string; claimUrl: string };
  const claimToken = new URL(claimUrl).hash.replace(/^#t=/, "");
  expect((await claim(request, sessionId, claimToken)).status()).toBe(200);
  await page.goto(claimUrl);
  await expect(page.getByRole("heading", { name: "Someone else is using this kiosk." })).toBeVisible();
  await check(page, info, "P7-taken");
});

test.describe(() => {
  // A second address: the tests above already make more than the 10 new sessions a minute one address may (R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.57" } });

  test("PX: idle warning one minute before expiry", async ({ page, request }, info) => {
    await page.clock.install();
    const s = await openPhone(page, request);
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Type instead" }).click();
    await page.getByRole("button", { name: "Eat here" }).click();
    await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
    expect(s.sessionId).toBeTruthy();

    // Sessions expire 10 min after the last activity. Moving only the page clock 9.5 min ahead shows the warning
    // without waiting; the next 30 s ping re-measures the offset and hides it again.
    await page.clock.setSystemTime(Date.now() + 9.5 * 60_000);
    await expect(page.getByRole("alertdialog", { name: "Still ordering?" })).toBeVisible();
    // The main viewport only: the warning goes away at the next ping, 30 s later.
    await check(page, info, "PX-idle-warning", [VIEWPORTS[0]]);
  });
});
