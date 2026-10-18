import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command, kioskRoot, readClaim, textLines } from "../helpers";
import { DEMO, LEARNED, PAIRING, qaState, type Findings, type Profile } from "./checks";

// UI QA of KIBO's pairing panel (12-phone-app:4; a slim status column since 14-final:1, the QR and code only on the
// kiosk): /kiosk on a landscape screen (a laptop as the kiosk), waiting for a phone and with one connected (claimed
// through the API); and /demo's [Start], where the laptop shows the kiosk alone and the judge's phone orders. Checks
// measure KIBO's parts; the scaled kiosk canvas beside them is checked at full size by kiosk.qa.spec.ts.

const STRICT = process.env.QA_ALL === "1";
const ITEM = { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } };

test.use({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.45" },
});

async function check(page: Page, info: TestInfo, state: string, profile: Profile = PAIRING) {
  const f: Findings = await qaState(page, info, profile, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`/kiosk landscape ${vp.width}x${vp.height}: waiting, then connected`, async ({ page, request, baseURL }, info) => {
    await page.setViewportSize(vp);
    await page.goto("/kiosk?k=malo");
    const panel = page.locator("[data-pairing-panel]");
    const { url, sessionId, claimToken } = await readClaim(page);
    // One QR, on the kiosk's own screen; the panel only says where to find it (14-final:1).
    await expect(page.locator("img[data-claim-url]")).toHaveCount(1);
    await expect(panel.getByText("Waiting for a phone")).toBeVisible();
    // SHORT_APP_URL is set on the QA server: the short host on one line (I-167); the claim URL keeps this server.
    await expect(panel.locator("[data-panel-pair-url]")).toHaveText("kibo-2026.web.app");
    expect(await textLines(panel.locator("[data-panel-pair-url]"))).toBe(1);
    expect(new URL(url).origin).toBe(new URL(baseURL ?? "").origin);
    await check(page, info, "kiosk-pairing-waiting");

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    await command(request, deviceToken, { sessionId, type: "addToCart", args: ITEM, source: "voice", utteranceSeq: 1 });
    await expect(panel.locator("[data-panel-order]")).toHaveText(/^Ordering · 1 item/);
    await check(page, info, "kiosk-pairing-connected");

    // The user confirms on the phone; the Korean kiosk asks for the card and the panel says so in English (14-final:0).
    await command(request, deviceToken, { sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    const review = await command(request, deviceToken, { sessionId, type: "requestCheckout", args: {}, source: "voice", utteranceSeq: 2 });
    await command(request, deviceToken, { sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: review.cartVersion });
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
    await expect(panel.locator("[data-panel-change]")).toHaveText("Confirmed by you");
    // KIBO picked 카드 after the phone's yes on this card-only kiosk, so only the card is left (I-427).
    await expect(panel.locator("[data-kiosk-step]")).toContainText("Insert your card, 카드 넣기 (Insert card)");
    await check(page, info, "kiosk-pairing-paying");
  });
}

for (const vp of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`/demo [Start] ${vp.width}x${vp.height}: the kiosk alone, waiting, connected, then the next order`, async ({ page, request }, info) => {
    await page.setViewportSize(vp);
    await page.goto("/demo?k=malo");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const step = page.locator("[data-kiosk-step]");
    const { sessionId, claimToken } = await readClaim(page);
    await expect(step).toHaveText("Start: scan the QR with your phone's camera.");
    await check(page, info, "demo-D2-own-phone-waiting", DEMO);

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
      command(request, deviceToken, { sessionId, type, args, ...extra });
    await phone("setDineOption", { option: "eat_in" }, { source: "button" });
    await phone("addToCart", ITEM, { source: "voice", utteranceSeq: 1 });
    await expect(step).toHaveText("Menu: your order shows at the bottom.");
    await check(page, info, "demo-D2-own-phone-connected", DEMO);

    const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
    await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });
    // KIBO picked 카드 after the phone's yes (owner 10-18), so the kiosk opens on its card step.
    const root = kioskRoot(page);
    await root.getByRole("button", { name: "카드 넣기" }).click();
    await root.getByRole("button", { name: "출력 안 함" }).click();
    await expect(step).toHaveText("Order number: done, no money was charged.");
    // [Try again] and the other places in view under the kiosk, the kiosk at the size it had from the start.
    const next = page.locator("[data-demo-next]");
    await expect(next.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 });
    // The other offered place (the learned kiosks are not offered, I-426), and the row's label still on one line.
    const places = next.getByRole("navigation", { name: "Try another place" }).getByRole("link");
    await expect(places).toHaveText(["Airport rail"]);
    for (const link of await places.all()) await expect(link).toBeInViewport({ ratio: 1 });
    expect(await textLines(next.getByRole("heading", { name: "Try another place" }))).toBe(1);
    await check(page, info, "demo-D3-own-phone-done", DEMO);
  });
}

test("/demo [Start] on the learned pizza kiosk 1280x720: KIBO's panel with the QR and code beside the page", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?k=doughhouse");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const { sessionId, claimToken } = await readClaim(page);
  await expect(page.locator("[data-learned-widget] [data-pair-code]")).toBeInViewport({ ratio: 1 });
  // The address line and the code sit centred under the centred QR, and the line never leaves one word alone on its
  // last line ("…and" / "enter", qa 10-16).
  const panel = await page.locator("[data-learned-widget]").evaluate((w) => {
    // The text's own extent, not its box: a stretched flex child's box is centred even when its text is not.
    const centre = (el: Element | null) => {
      const range = document.createRange();
      range.selectNodeContents(el!);
      const r = range.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    // The words on the sentence's last line, each word measured by its own range.
    const lastLineWords = (el: Element) => {
      const tops: number[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
          const word = document.createRange();
          word.setStart(n, m.index!);
          word.setEnd(n, m.index! + m[0].length);
          tops.push(Math.round(word.getBoundingClientRect().top));
        }
      }
      return tops.filter((t) => t === Math.max(...tops)).length;
    };
    const sentence = w.querySelector("[data-pair-url]")!.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(sentence);
    const rows = new Map<number, { left: number; right: number }>();
    for (const r of range.getClientRects()) {
      if (r.width === 0) continue;
      const row = rows.get(Math.round(r.top)) ?? { left: r.left, right: r.right };
      rows.set(Math.round(r.top), { left: Math.min(row.left, r.left), right: Math.max(row.right, r.right) });
    }
    const widths = [...rows.values()].map((r) => r.right - r.left);
    return {
      qr: ((r) => r.left + r.width / 2)(w.querySelector("img[data-claim-url]")!.getBoundingClientRect()),
      code: centre(w.querySelector("[data-pair-code]")),
      sentence: (Math.min(...[...rows.values()].map((r) => r.left)) + Math.max(...[...rows.values()].map((r) => r.right))) / 2,
      lines: widths.length,
      lastLineWords: lastLineWords(sentence),
    };
  });
  expect(Math.abs(panel.code - panel.qr)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.sentence - panel.qr)).toBeLessThanOrEqual(1);
  expect(panel.lines).toBeLessThanOrEqual(2);
  if (panel.lines === 2) expect(panel.lastLineWords).toBeGreaterThanOrEqual(2);
  // The short address never breaks inside itself ("kibo-2026." / "web.app").
  expect(await textLines(page.locator("[data-learned-widget] [data-pair-url]"))).toBe(1);
  await check(page, info, "demo-D2-own-phone-learned-waiting", LEARNED);
  await claim(request, sessionId, claimToken);
  await expect(page.locator("[data-learned-widget]").getByText("Phone connected")).toBeVisible();
  await check(page, info, "demo-D2-own-phone-learned-connected", LEARNED);
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.155" } });

  // The bunsik shop (I-405): its fixed 720×1280 page beside KIBO's panel, then the review with three other places in the
  // row under it (it has no D1 card, so every card place is "another").
  test("/demo [Start] on the learned bunsik shop 1280x720: QR and code beside the page, then the next order row", async ({ page, request }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/demo?k=bunsik");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const { sessionId, claimToken } = await readClaim(page);
    await expect(page.locator("[data-learned-widget] [data-pair-code]")).toBeInViewport({ ratio: 1 });
    await check(page, info, "demo-D2-own-phone-bunsik-waiting", LEARNED);
    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    const widget = page.locator("[data-learned-widget]");
    await expect(widget.getByText("Phone connected")).toBeVisible();
    const phone = (type: string, args: object, utteranceSeq?: number) =>
      command(request, deviceToken, { sessionId, type, args, source: utteranceSeq ? "voice" : "button", utteranceSeq });
    await phone("setDineOption", { option: "eat_in" });
    await expect(widget).toHaveAttribute("data-bridge-ok", "true");
    await phone("addToCart", { itemId: "cheese_tteokbokki", qty: 1, selections: { spice: ["lv3"], tteok_topping: ["boiled_egg"] } }, 1);
    await expect(widget).toContainText("kiosk total 6,000원 ✓ matches", { timeout: 15_000 });
    await check(page, info, "demo-D2-own-phone-bunsik-connected", LEARNED);
    await phone("requestCheckout", {}, 2);
    const next = page.locator("[data-demo-next]");
    await expect(next.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 });
    for (const link of await next.getByRole("navigation", { name: "Try another place" }).getByRole("link").all()) {
      await expect(link).toBeInViewport({ ratio: 1 });
    }
    // The row's label keeps one line beside three places (it wrapped to three in a 644px card).
    expect(await textLines(next.getByRole("heading", { name: "Try another place" }))).toBe(1);
    await check(page, info, "demo-D3-own-phone-bunsik-done", DEMO);
  });
});
