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
