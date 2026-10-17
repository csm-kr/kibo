import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { buttonWithText, command, kioskRoot, readClaim, warmPhone } from "./helpers";

// The owner's 10-17 run on a real iPhone, without Gemini: /demo [Start] on the laptop (the kiosk alone) and the judge's
// own phone. The user spoke before choosing eat here or take out; the AI's buttons went to the phone's dine screen
// (P2), which had none, and a later eat-in tap wiped them. Here the AI's calls go through the API with the phone's
// device token, as the voice model sends them; a tapped choice goes to /api/chat, which the test answers as the text
// agent would (an addToCart through the API).

const LAPTOP = "192.0.2.140";
const PHONE = "192.0.2.141";

// Its own addresses for the dev server's per-IP limits (R-005).
test.use({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": LAPTOP } });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

const BURGERS = ["cheese_burger", "bulgogi_burger", "double_cheese_burger"].map((id) => ({ kind: "item", id }));

/** The laptop on /demo [Start], and a phone that opens the kiosk's QR link and goes past its first screens by typing. */
async function ownPhone(laptop: Page, browser: Browser, baseURL: string | undefined) {
  await laptop.goto("/demo?k=malo");
  await laptop.getByRole("button", { name: "Start", exact: true }).click();
  await expect(laptop.locator("main[data-demo-own-phone]")).toBeVisible();
  const { url, sessionId } = await readClaim(laptop);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "X-Forwarded-For": PHONE },
  });
  const phone = await context.newPage();
  await phone.goto(url);
  await phone.getByRole("button", { name: "Start" }).click();
  await phone.getByRole("button", { name: "Type instead" }).click();
  await expect(phone.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "dine");
  const key = `kibo.phone.${sessionId}`;
  await expect.poll(() => phone.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await phone.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  const ai = (type: string, args: object, utteranceSeq: number) =>
    command(phone.request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
  return { context, phone, sessionId, deviceToken, ai };
}

/** /api/chat as the text agent would answer a tapped "Cheeseburger": the add goes through the API. */
async function answerTap(phone: Page, sessionId: string, deviceToken: string, messages: string[]) {
  await phone.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { message: string; utteranceSeq: number };
    messages.push(body.message);
    const added = await command(phone.request, deviceToken, {
      sessionId,
      type: "addToCart",
      args: { itemId: "cheese_burger", variant: "single" },
      source: "text",
      utteranceSeq: body.utteranceSeq,
    });
    await route.fulfill({
      json: { ok: true, reply: "Added a cheeseburger.", ...added, actions: [], heldForDine: false, replySource: "model" },
    });
  });
}

test("choices the AI offers before the dine option show on the phone, stay through an eat-in tap, and a tap fills the laptop kiosk", async ({
  page: laptop,
  browser,
}, info) => {
  const { context, phone, sessionId, deviceToken, ai } = await ownPhone(laptop, browser, info.project.use.baseURL);
  try {
    // "A burger, please." before any dine option: the AI asks which one.
    await ai("offerChoices", { templateId: "pick_item", choices: BURGERS }, 1);
    await expect(phone.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
    const choices = phone.locator("[data-choices]");
    await expect(choices.getByRole("heading", { name: "Which one would you like?" })).toBeVisible();
    await expect(buttonWithText(choices, "Cheeseburger")).toBeInViewport();
    await expect(kioskRoot(laptop)).toHaveAttribute("data-screen", "dine");

    // Eat here, tapped on the kiosk: the AI's question is still unanswered, so its buttons stay.
    await kioskRoot(laptop).getByRole("button", { name: "매장에서 먹기" }).click();
    await expect(kioskRoot(laptop)).toHaveAttribute("data-screen", "menu");
    await expect(buttonWithText(choices, "Cheeseburger")).toBeVisible();

    const messages: string[] = [];
    await answerTap(phone, sessionId, deviceToken, messages);
    await buttonWithText(choices, "Cheeseburger").click();
    // The tap is the user's answer, and the kiosk fills its own cart.
    await expect(buttonWithText(kioskRoot(laptop), "치즈버거")).toHaveClass(/k-ring/);
    await expect(phone.getByRole("region", { name: "Your order" }).getByText("Cheeseburger single", { exact: true })).toBeVisible();
    expect(messages).toEqual(["Cheeseburger"]);
    await expect(choices).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("an order spoken before the dine option still gets the dine question, as buttons at checkout", async ({ page: laptop, browser }, info) => {
  const { context, phone, sessionId, deviceToken, ai } = await ownPhone(laptop, browser, info.project.use.baseURL);
  try {
    await ai("offerChoices", { templateId: "pick_item", choices: BURGERS }, 1);
    const choices = phone.locator("[data-choices]");
    await answerTap(phone, sessionId, deviceToken, []);
    await buttonWithText(choices, "Cheeseburger").click();
    await expect(buttonWithText(kioskRoot(laptop), "치즈버거")).toHaveClass(/k-ring/);

    // "That's all": the server asks the dine option first, and the AI shows it as buttons on the talk screen.
    const refused = await phone.request.post("/api/command", {
      headers: { Authorization: `Bearer ${deviceToken}` },
      data: { sessionId, commandId: randomUUID(), type: "requestCheckout", args: {}, source: "voice", utteranceSeq: 3 },
    });
    expect(refused.status()).toBe(422);
    expect((await refused.json()).error.detail.templateId).toBe("pick_dine");
    await ai("offerChoices", { templateId: "pick_dine", choices: [{ kind: "dine", id: "eat_in" }, { kind: "dine", id: "take_out" }] }, 3);
    await expect(choices.getByRole("heading", { name: "Eat here or take out?" })).toBeVisible();
    await buttonWithText(choices, "Eat here").click();
    await expect(choices).toHaveCount(0);
    await ai("requestCheckout", {}, 4);
    await expect(kioskRoot(laptop)).toHaveAttribute("data-screen", "review");
    await expect(phone.getByRole("button", { name: "Yes, pay now" })).toBeVisible();
  } finally {
    await context.close();
  }
});
