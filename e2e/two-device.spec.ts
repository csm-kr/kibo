import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { CartLine } from "@/types/session";
import { buttonWithText, command, kioskRoot, readClaim, warmPhone } from "./helpers";
import { writeQrVideo } from "./qrVideo";

// The two-device demo end to end (docs/TESTING.md "End to end", USER_JOURNEY J1): a laptop on /kiosk (browser A,
// landscape, so KIBO's pairing panel shows) and a phone (browser B, its own Chromium, 390×844) that opens /app,
// scans the kiosk QR with its camera (Chromium's fake camera plays a video of the real claim URL) and orders. The two
// browsers talk only through the real API and session streams. The AI's tool calls are sent through the API with the
// phone's device token, as the voice model would; the @live test lets Gemini Live make them from a spoken sentence.

const PHONE_ADDRESS = "192.0.2.46";
const KIOSK_ADDRESS = "192.0.2.47";

// The kiosk browser (A): a laptop. Its own address for the per-IP limits (R-005).
test.use({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": KIOSK_ADDRESS } });

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

/** Opens /kiosk on the laptop and waits for the panel's QR; returns the claim URL. */
async function openKiosk(kiosk: Page) {
  await kiosk.goto("/kiosk?k=malo");
  const claim = await readClaim(kiosk);
  await expect(kiosk.locator("[data-pairing-panel]").getByText("Waiting for a phone")).toBeVisible();
  return claim;
}

/**
 * Browser B: a phone whose camera sees the kiosk QR (and, for voice, whose microphone plays a fixture). Launch flags
 * cannot change inside one Playwright worker, so it is its own Chromium.
 */
async function openPhone(claimUrl: string, baseURL: string | undefined, audio?: string): Promise<{ phone: Page; browser: Browser }> {
  const video = join(mkdtempSync(join(tmpdir(), "kibo-two-")), "kiosk.y4m");
  writeQrVideo(video, claimUrl);
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`];
  if (audio) {
    args.push(`--use-file-for-fake-audio-capture=${join(process.cwd(), "e2e/fixtures", audio)}`, "--autoplay-policy=no-user-gesture-required");
  }
  const browser = await chromium.launch({ args });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    isMobile: true,
    hasTouch: true,
    permissions: audio ? ["camera", "microphone"] : ["camera"],
    extraHTTPHeaders: { "X-Forwarded-For": PHONE_ADDRESS },
  });
  return { phone: await context.newPage(), browser };
}

/** /app → [Scan a kiosk] → camera → /assistant, as a person would; returns the phone's device token. */
async function scanFromApp(phone: Page, sessionId: string): Promise<string> {
  await phone.goto("/app");
  await phone.getByRole("link", { name: "Scan a kiosk" }).click({ timeout: 60_000 });
  await expect(phone).toHaveURL(/\/app\/scan$/);
  await phone.getByRole("button", { name: "Turn on the camera" }).click({ timeout: 60_000 });
  await expect(phone).toHaveURL(`/assistant?s=${sessionId}`, { timeout: 20_000 });
  // The claim stored the device token (usePhoneSession).
  const key = `kibo.phone.${sessionId}`;
  await expect.poll(() => phone.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  return (await phone.evaluate((k) => localStorage.getItem(k), key)) ?? "";
}

test("laptop kiosk and phone: scan in /app, order, confirm on the phone, pay on the kiosk", async ({ page: kiosk }, info) => {
  const { url, sessionId } = await openKiosk(kiosk);
  const panel = kiosk.locator("[data-pairing-panel]");
  const { phone, browser } = await openPhone(url, info.project.use.baseURL);
  try {
    const deviceToken = await scanFromApp(phone, sessionId);
    await expect(panel.getByText(/^Phone connected at \d\d:\d\d$/)).toBeVisible();
    await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "dine");

    // The phone's own buttons: start, the microphone hint (typing here; voice is the @live test), the dine option.
    await phone.getByRole("button", { name: "Start" }).click();
    await expect(phone.getByRole("heading", { name: "Turn on the microphone to talk" })).toBeVisible();
    await phone.getByRole("button", { name: "Type instead" }).click();
    await phone.getByRole("button", { name: "Eat here" }).click();
    await expect(phone.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
    await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "menu");

    // What the AI would send for "One cheeseburger set with zero cola".
    const ai = (type: string, args: object, utteranceSeq: number) =>
      command(phone.request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } }, 1);
    await expect(buttonWithText(kiosk, "치즈버거")).toHaveClass(/k-ring/);
    await expect(phone.getByRole("region", { name: "Your order" }).getByText("Cheeseburger set", { exact: true })).toBeVisible();
    await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item · ₩[\d,]+$/);
    await expect(panel.getByText("Last change: by the AI")).toBeVisible();

    // "That's all, I'll pay." opens the review on both; only the user's tap on the phone confirms.
    await ai("requestCheckout", {}, 2);
    await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "review");
    await phone.getByRole("button", { name: "Yes, pay now" }).click();
    await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "payment");
    await expect(phone.getByRole("heading", { name: "Insert your card into the kiosk" })).toBeVisible();

    // The card goes into the kiosk (A), and the number shows on the phone (B).
    const root = kioskRoot(kiosk);
    await root.getByRole("button", { name: "카드", exact: true }).click();
    await root.getByRole("button", { name: "카드 넣기" }).click();
    await expect(root).toHaveAttribute("data-screen", "done");
    await expect(phone.getByRole("heading", { name: "Order number" })).toBeVisible();
    await expect(panel.locator("[data-panel-order]")).toHaveText(/^Paid · order number \d+$/);
  } finally {
    await browser.close();
  }
});

/** The hero cart: two cheeseburger sets, drinks zero cola and cider, exactly one without pickles. */
function isHero(cart: CartLine[]): boolean {
  if (cart.length !== 2 || !cart.every((l) => l.itemId === "cheese_burger" && l.variant === "set" && l.qty === 1)) return false;
  const drinks = cart.map((l) => l.selections.drink?.[0]).sort();
  const noPickles = cart.filter((l) => l.selections.ingredients?.includes("no_pickles")).length;
  return JSON.stringify(drinks) === JSON.stringify(["cider", "zero_cola"]) && noPickles === 1;
}

test("@live laptop kiosk and phone: the hero order spoken in Korean to the phone fills the kiosk", async ({ page: kiosk }, info) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini Live; run `npm run test:e2e:live`");
  const { url, sessionId } = await openKiosk(kiosk);
  const { phone, browser } = await openPhone(url, info.project.use.baseURL, "hero-ko.wav");
  try {
    await scanFromApp(phone, sessionId);
    // `?e2e=1` makes the phone send the looping fixture once (src/lib/voice/e2eMarks.ts); the token is stored, so
    // reopening the page reconnects without a claim.
    await phone.goto(`/assistant?s=${sessionId}&e2e=1`);

    let cart: CartLine[] = [];
    const commands: string[] = [];
    phone.on("response", async (res) => {
      if (res.request().method() !== "POST" || !res.url().endsWith("/api/command")) return;
      try {
        const json = (await res.json()) as { ok: boolean; cart?: CartLine[]; error?: { code: string } };
        if (json.ok && json.cart) cart = json.cart;
        commands.push(`${(JSON.parse(res.request().postData() ?? "{}") as { type?: string }).type}:${json.ok ? "ok" : json.error?.code}`);
      } catch {
        // The page closed before the body arrived.
      }
    });

    await phone.getByRole("button", { name: "Start" }).click({ timeout: 60_000 });
    // P1: [Turn on the microphone] starts voice at once; the dine option is a tap on P2 while it listens.
    await phone.getByRole("button", { name: "Turn on the microphone" }).click();
    await phone.getByRole("button", { name: "Eat here" }).click();
    const mic = phone.locator("button[data-voice-state]");
    await expect(mic).toHaveAttribute("data-voice-state", /listening|thinking|speaking/, { timeout: 20_000 });

    await expect.poll(() => isHero(cart), { timeout: 60_000, intervals: [200], message: `commands: ${commands.join(", ")}` }).toBe(true);
    // The kiosk on the laptop shows both lines, and the panel says the AI changed it.
    await expect(kioskRoot(kiosk)).toHaveAttribute("data-screen", "menu");
    await expect(kiosk.locator("[data-kiosk-canvas]").getByText("치즈버거 세트 ×1", { exact: true })).toHaveCount(2);
    await expect(kiosk.locator("[data-panel-order]")).toHaveText(/^Ordering · 2 items · ₩[\d,]+$/);
    await mic.click();
    await expect(mic).toHaveAttribute("data-voice-state", "off");
  } finally {
    await browser.close();
  }
});
