import { expect, test, type Page } from "@playwright/test";
import { claim, command, kioskRoot, readClaim } from "../helpers";

// Coordinate checks for the kiosk half (issue #1, batch A): what is cut, faded or moved, measured on the canvas
// instead of judged on screenshots.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.81" },
});

/** The demo's hero order: two cheeseburger sets with different drinks (docs/PRD.md "Demo scenario"). */
const HERO = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
];

/** A claimed /kiosk with the hero order added by the AI, so K3 shows it with the KIBO subtitle. */
async function kioskWithHero(page: Page, request: Parameters<typeof claim>[0]) {
  await page.goto("/kiosk?k=malo");
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  let seq = 0;
  await command(request, deviceToken, { sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "voice", utteranceSeq: ++seq });
  for (const args of HERO) await command(request, deviceToken, { sessionId, type: "addToCart", args, source: "voice", utteranceSeq: ++seq });
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  await expect(page.locator("[data-kiosk-subtitle]")).toBeVisible();
  return { sessionId, deviceToken, seq };
}

/**
 * For a scroll area on the canvas: whether it holds more below, and whether a fade that lets taps through covers its
 * bottom edge (an overlay beside it, not inside it, so the fade does not scroll away).
 */
function bottomEdge(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const fade = [...(el.parentElement?.children ?? [])].some((o) => {
      if (o === el) return false;
      const cs = getComputedStyle(o);
      const b = o.getBoundingClientRect();
      return (
        cs.backgroundImage.includes("gradient") &&
        cs.pointerEvents === "none" &&
        Math.abs(b.bottom - r.bottom) <= 1 &&
        b.left < r.right - 1 &&
        b.right > r.left + 1
      );
    });
    return { more: el.scrollHeight - el.scrollTop - el.clientHeight > 1, fade };
  });
}

const RAIL = "[data-kiosk-canvas] nav[aria-label]";
const GRID = "[data-kiosk-canvas] nav[aria-label] + div";

test("K3: the menu grid and the category rail fade out at their bottom edge while they hold more (#1 item 3)", async ({ page, request }) => {
  await kioskWithHero(page, request);
  // While the subtitle takes its row, the last visible tile and category are cut at the cart bar.
  expect(await bottomEdge(page, GRID)).toEqual({ more: true, fade: true });
  expect(await bottomEdge(page, RAIL)).toEqual({ more: true, fade: true });

  // At the end there is nothing more, so nothing is faded over the last row.
  for (const sel of [GRID, RAIL]) await page.locator(sel).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect.poll(() => bottomEdge(page, GRID)).toEqual({ more: false, fade: false });
  await expect.poll(() => bottomEdge(page, RAIL)).toEqual({ more: false, fade: false });
});

/** /demo started on MALO, with the phone half's own session tokens. */
async function startDemo(page: Page) {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "dine");
  return s;
}

/** The kiosk canvas on /demo, the box it is drawn in, and that box's background (the letterbox). */
function kioskBox(page: Page) {
  return page.locator("[data-kiosk-canvas]").evaluate((c) => {
    const r = c.getBoundingClientRect();
    const frame = c.parentElement as HTMLElement;
    const f = frame.getBoundingClientRect();
    return {
      top: r.top,
      height: r.height,
      scale: r.width / 1080,
      sideSpace: Math.max(r.left - f.left, f.right - r.right),
      letterbox: getComputedStyle(frame).backgroundColor,
    };
  });
}

test.describe("/demo", () => {
  test.use({ viewport: { width: 1280, height: 720 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.82" } });

  test("the space the kiosk leaves beside it is the page, not a dark band (#1 item 10)", async ({ page, request }) => {
    const s = await startDemo(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    for (const args of HERO) await ai("addToCart", args);
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
    await expect(page.locator("[data-card-reader]")).toBeVisible();
    // The step line and the card reader take height, so the canvas is narrower than its column here.
    const box = await kioskBox(page);
    expect(box.sideSpace).toBeGreaterThan(1);
    expect(box.letterbox).toBe("rgba(0, 0, 0, 0)");
  });

  test("D3: once the order number is on the kiosk, the step line stops asking the receipt question (#1 item 13)", async ({ page, request }) => {
    const s = await startDemo(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", HERO[0]);
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await expect(kioskRoot(page)).toHaveAttribute("data-screen", "done");
    const step = page.locator("[data-kiosk-step]");
    await expect(step).toHaveText("Kiosk: receipt question, then the order number.");
    await page.getByRole("button", { name: "출력 안 함" }).click();
    await expect(page.getByRole("heading", { name: "주문 번호" })).toBeVisible();
    await expect(step).toHaveText("Kiosk: order number. The order is done; no money was charged.");
  });
});
