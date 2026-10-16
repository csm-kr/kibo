import { expect, test, type Page } from "@playwright/test";
import { command, openScenarios } from "./helpers";

// /demo scenario guide (D2): the third column; choosing a scenario starts a fresh order; a sentence chip sends the
// sentence as the user's message; a step ticks from the live session. No model calls here: /api/chat is answered by
// the test and the AI's tool call is sent through the API with the demo's device token. The @live test needs
// E2E_LIVE=1 and plays a scenario through real Gemini.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.28" },
});

interface DemoSession {
  sessionId: string;
  deviceToken: string;
}

/** Runs `click` and returns the demo session it created. */
async function newSession(page: Page, click: () => Promise<void>): Promise<DemoSession> {
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await click();
  const json = (await (await created).json()) as DemoSession & { ok: boolean };
  expect(json.ok).toBe(true);
  return json;
}

const guide = (page: Page) => page.locator("[data-scenario-guide]");
const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("scenario guide: beside the phone, a chosen scenario starts fresh, its step ticks from the session", async ({ page, request }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  const first = await newSession(page, () => page.getByRole("button", { name: "Try it on this screen" }).click());

  // The third column beside the phone at every judge size (#1 E, I-132).
  await expect(page.locator("[data-scenario]")).toHaveCount(6);

  // MALO scenario 4: "Is this halal?"
  const s = await newSession(page, () => page.locator('[data-scenario="halal"]').click());
  expect(s.sessionId).not.toBe(first.sessionId);
  const step = guide(page).locator('[data-scenario-step="0"]');
  await expect(step).toHaveAttribute("data-done", "false");
  await expect(guide(page).getByRole("button", { name: "Play it for me" })).toBeDisabled();
  await expect(guide(page).getByText("First choose eat here or take out on the phone.")).toBeVisible();
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(guide(page).getByRole("button", { name: "Play it for me" })).toBeEnabled();

  // A sentence chip goes through the phone's own send, so it shows as the user's message.
  let sent: { message?: string } = {};
  await page.route("**/api/chat", async (route) => {
    sent = route.request().postDataJSON() as { message?: string };
    await route.fulfill({ json: { ok: true, reply: "This kiosk doesn't have that information.", status: "connected", cart: [], total: 0, cartVersion: 0 } });
  });
  await step.getByRole("button", { name: "Is this halal?" }).click();
  await expect(phoneScreen(page).getByText("Is this halal?", { exact: true })).toBeVisible();
  expect(sent.message).toBe("Is this halal?");

  // The agent's tool call, as /api/chat would send it.
  await command(request, s.deviceToken, {
    sessionId: s.sessionId,
    type: "callStaff",
    args: { reasonCode: "unknown_info" },
    source: "text",
    utteranceSeq: 1,
  });
  await expect(step).toHaveAttribute("data-done", "true");
  await expect(step.getByText("Done", { exact: true })).toBeVisible();
  await expect(guide(page).locator("[data-scenario-your-turn]")).toContainText("Yes, pay now");
  // Nothing in the guide pays or confirms.
  await expect(guide(page).getByRole("button", { name: /pay|confirm|card/i })).toHaveCount(0);

  // Once the order is paid, "Your turn" no longer asks for a step that is already done (I-144).
  const kiosk = s as DemoSession & { kioskToken: string };
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "addToCart", args: { itemId: "cola" }, source: "text", utteranceSeq: 2 });
  const review = await command(request, s.deviceToken, { sessionId: s.sessionId, type: "requestCheckout", args: {}, source: "text", utteranceSeq: 3 });
  await command(request, s.deviceToken, { sessionId: s.sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: review.cartVersion });
  // While paying, only the card is left (I-242).
  await expect(guide(page).locator("[data-scenario-your-turn]")).toHaveText("Your turn: insert the card at the kiosk.");
  await command(request, kiosk.kioskToken, { sessionId: s.sessionId, type: "cardAction", args: {}, source: "touch" });
  await expect(guide(page).locator("[data-scenario-your-turn]")).toHaveText("Paid. Choose another scenario to try more.");
});

test("@live Play it for me: Sunja's lunch reaches the confirm card with two sets and large fries", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
  test.setTimeout(240_000);
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await newSession(page, () => page.getByRole("button", { name: "Try it on this screen" }).click());
  await openScenarios(page);
  await newSession(page, () => page.locator('[data-scenario="sunja-lunch"]').click());

  // The scenarios assume the dine option comes first.
  const play = guide(page).getByRole("button", { name: "Play it for me" });
  await expect(play).toBeDisabled();
  await phoneScreen(page).getByRole("button", { name: "Eat here" }).click();
  await expect(play).toBeEnabled();
  await play.click();

  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirm", { timeout: 180_000 });
  await expect(guide(page).locator('[data-scenario-step][data-done="true"]')).toHaveCount(3);
  const lines = page.locator('section[aria-labelledby="phone-confirm-title"] li');
  await expect(lines).toHaveCount(2);
  for (const line of await lines.all()) await expect(line).toContainText("Fries (L)");
  // The player stops at the review: the phone still waits for the user's tap.
  await page.waitForTimeout(3_000);
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "confirm");
});

// Every other scenario played once through real Gemini (phase 8 QA): the player reaches the end of the checklist and
// the order never gets past the review by itself.
const PLAYED = [
  { kioskId: "malo", id: "not-sure", dine: true },
  { kioskId: "malo", id: "sold-out", dine: true },
  { kioskId: "malo", id: "halal", dine: true },
  { kioskId: "malo", id: "ai-cannot-pay", dine: true },
  { kioskId: "malo", id: "undo", dine: true },
  { kioskId: "airport_rail", id: "mei-tickets", dine: false },
  { kioskId: "airport_rail", id: "which-platform", dine: false },
  { kioskId: "doughhouse", id: "learned-pizza", dine: true },
];

PLAYED.forEach((p, i) => {
  test.describe(() => {
    // Each its own address: every test opens two sessions and several chat requests (R-005).
    test.use({ extraHTTPHeaders: { "X-Forwarded-For": `192.0.2.${60 + i}` } });

    test(`@live Play it for me: ${p.kioskId} ${p.id} reaches the end of its checklist`, async ({ page }) => {
      test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
      test.setTimeout(240_000);
      await page.goto(`/demo?k=${p.kioskId}`);
      await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
      await newSession(page, () => page.getByRole("button", { name: "Try it on this screen" }).click());
      await openScenarios(page);
      await newSession(page, () => page.locator(`[data-scenario="${p.id}"]`).click());
      if (p.dine) await phoneScreen(page).getByRole("button", { name: "Eat here" }).click();

      const play = guide(page).getByRole("button", { name: "Play it for me" });
      await expect(play).toBeEnabled();
      await play.click();
      const yourTurn = guide(page).locator("[data-scenario-your-turn]");
      const failed = guide(page).getByText(/didn't go as expected|Demo limit reached/);
      // Attached, not visible: the first tool call switches the third column to "What the AI did" (#1 E).
      await expect(yourTurn.or(failed)).toHaveCount(1, { timeout: 200_000 });
      await openScenarios(page);
      await expect(yourTurn, "the player failed a step").toBeVisible();
      // Nothing in a scenario pays: the phone is never on the card or order-number screen.
      await page.waitForTimeout(2_000);
      await expect(phoneScreen(page)).not.toHaveAttribute("data-phone-screen", /^(pay|done)$/);
    });
  });
});
