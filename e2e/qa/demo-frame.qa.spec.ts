import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { command, kioskRoot } from "../helpers";
import { qaState, type Findings, type Profile } from "./checks";

// UI QA of the /demo frame (issue #1 batch E, docs/UI_GUIDE.md "/demo frame"): the top bar over D1, D2 and D3, the
// question a place tab asks before it clears an open order, and the kiosk column's caption row with the kiosk's step
// and the card stand-in under the kiosk. The phone and third columns are measured by demo.qa.spec.ts (DEMO,
// DEMO_GUIDE); the scaled kiosk canvas by the kiosk specs at full size.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

/** The top bar: KIBO, "Live demo", the place tabs and "How it works", judged by the phone numbers. */
const TOPBAR: Profile = { route: "/demo", root: "[data-demo-topbar]", minFont: 16, minTarget: 56 };
/** The question a place tab asks while the order has lines and is not paid. */
const LEAVE: Profile = { route: "/demo", root: "dialog[open]", minFont: 16, minTarget: 56 };
/** The kiosk column's caption row: "1 Kiosk · unchanged" and the kiosk's step in English. */
const KIOSK_CAPTION: Profile = { route: "/demo", root: 'section[aria-labelledby="demo-kiosk-caption"] > div', minFont: 16, minTarget: 56 };
/** The card stand-in under the kiosk at payment. */
const READER: Profile = { route: "/demo", root: "[data-card-reader]", minFont: 16, minTarget: 56 };

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  locale: "en-US",
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.97" },
});

async function check(page: Page, info: TestInfo, state: string, profile: Profile, viewports = VIEWPORTS) {
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, profile, state);
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test("the /demo frame: top bar, the leave question, the kiosk's caption row and card stand-in", async ({ page, request }, info) => {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
  await check(page, info, "D1-topbar", TOPBAR);

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  await check(page, info, "D2-kiosk-caption-dine", KIOSK_CAPTION);

  let seq = 0;
  const ai = (type: string, args: object) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  await ai("setDineOption", { option: "eat_in" });
  await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } });
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);
  await check(page, info, "D2-topbar", TOPBAR, [VIEWPORTS[0], VIEWPORTS[1]]);

  await page.locator("[data-demo-topbar]").getByRole("link", { name: "Airport rail" }).click();
  await expect(page.getByRole("dialog", { name: "Start over at Airport rail?" })).toBeVisible();
  await check(page, info, "D2-leave-ask", LEAVE, [VIEWPORTS[0], VIEWPORTS[1]]);
  await page.keyboard.press("Escape");

  await ai("requestCheckout", {});
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await check(page, info, "D2-kiosk-caption-payment", KIOSK_CAPTION);
  await check(page, info, "D2-card-reader", READER);
});

/**
 * The px of the focused control's ring (outline width plus offset, scaled on the kiosk canvas) that a clipping box or
 * the viewport cuts, per side; null on the page itself.
 */
function focusRingCut(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\s+/g, " ").trim().slice(0, 40);
    if (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) === 0) return { name, cut: "no ring" };
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const out = (parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth)) * scale;
    const ring = { top: r.top - out, bottom: r.bottom + out, left: r.left - out, right: r.right + out };
    const cut = { top: 0, bottom: 0, left: 0, right: 0 };
    const clip = (b: { top: number; bottom: number; left: number; right: number }) => {
      cut.top = Math.max(cut.top, b.top - ring.top);
      cut.bottom = Math.max(cut.bottom, ring.bottom - b.bottom);
      cut.left = Math.max(cut.left, b.left - ring.left);
      cut.right = Math.max(cut.right, ring.right - b.right);
    };
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") clip(a.getBoundingClientRect());
    }
    clip({ top: 0, left: 0, bottom: innerHeight, right: innerWidth });
    const sides = Object.entries(cut).filter(([, px]) => px > 0.5).map(([side, px]) => `${side} ${Math.round(px * 10) / 10}px`);
    return { name, cut: sides.join(", ") };
  });
}

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 720 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.98" } });

  test("a keyboard walk through D2 at 1280×720: every focus ring is whole, none cut by the frame, a card or a scroll edge (#1 22)", async ({ page, request }) => {
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Try it on this screen" })).toBeVisible({ timeout: 60_000 });
    const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Try it on this screen" }).click();
    const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } });
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

    // From the top of the page through the top bar, the kiosk (its category rail, tiles and cart bar), the phone and
    // the scenarios, as a keyboard user goes.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const seen = new Map<string, string>();
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press("Tab");
      const at = await focusRingCut(page);
      if (at && !seen.has(at.name)) seen.set(at.name, at.cut);
    }
    for (const name of ["Burger shop", "Airport rail", "How it works", "버거", "디저트", "Language and text size: English", "Call staff", "Scenarios"])
      expect([...seen.keys()].some((n) => n.startsWith(name)), `the walk reaches ${name}`).toBe(true);
    expect([...seen].filter(([, cut]) => cut !== "").map(([name, cut]) => `${name}: ${cut}`)).toEqual([]);
  });
});
