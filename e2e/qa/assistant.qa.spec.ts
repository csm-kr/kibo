import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { claim, command, warmPhone } from "../helpers";
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

test.use({ viewport: VIEWPORTS[0], locale: "en-US", isMobile: true, hasTouch: true });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

async function check(page: Page, info: TestInfo, state: string, viewports = VIEWPORTS) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, PHONE, state, { reflow: true });
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

const screenOf = (page: Page) => page.locator("[data-phone-screen]");

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
  await check(page, info, "P4-confirm");

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "pay");
  await check(page, info, "P5-pay");

  await s.kiosk("cardAction");
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "done");
  await check(page, info, "P6-done");
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

test("P7: someone else is using this kiosk", async ({ page, request }, info) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const { sessionId, claimUrl } = (await res.json()) as { sessionId: string; claimUrl: string };
  const claimToken = new URL(claimUrl).hash.replace(/^#t=/, "");
  expect((await claim(request, sessionId, claimToken)).status()).toBe(200);
  await page.goto(claimUrl);
  await expect(page.getByRole("heading", { name: "Someone else is using this kiosk." })).toBeVisible();
  await check(page, info, "P7-taken");
});

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
