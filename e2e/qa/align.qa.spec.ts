import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { claim, command, kioskRoot, readClaim } from "../helpers";

// Alignment checks from the 10-16 design-QA pass over the screens the submission video films (F2, F3, F4, F5, F10,
// F13 in the pass's table; F1's intro screen is gone since 10-17): measured coordinates, not screenshots.

test.use({
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.93" },
});

const HERO = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
];

/** A claimed portrait /kiosk with the hero order in the cart. */
async function kioskWithHero(page: Page, request: APIRequestContext) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto("/kiosk?k=malo");
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  let seq = 0;
  const phone = (type: string, args: object = {}, extra: object = {}) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq, ...extra });
  await phone("setDineOption", { option: "eat_in" });
  for (const args of HERO) await phone("addToCart", args);
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  return { phone };
}

test("kiosk cart bar: the count and the first chip start on one left line (F5)", async ({ page, request }) => {
  await kioskWithHero(page, request);
  const lefts = await page.locator("section[aria-label]").filter({ has: page.locator("ul li") }).last().evaluate((bar) => {
    const count = bar.querySelector("span")!;
    const range = document.createRange();
    range.selectNodeContents(count);
    return { count: range.getBoundingClientRect().left, chip: bar.querySelector("ul li")!.getBoundingClientRect().left };
  });
  expect(Math.abs(lefts.count - lefts.chip)).toBeLessThanOrEqual(1);
});

test("kiosk payment: the three method tiles share icon and label lines, the tiles fill the screen, and [카드 넣기] clears the total panel (F2, F3, F4)", async ({ page, request }) => {
  const { phone } = await kioskWithHero(page, request);
  const review = await phone("requestCheckout");
  await phone("confirmCheckout", {}, { source: "button", cartVersion: review.cartVersion });
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  const tiles = await page.locator(".grid-cols-3 > button").evaluateAll((buttons) =>
    buttons.map((b) => {
      const icon = b.querySelector("svg")!.getBoundingClientRect();
      const label = b.querySelector("span")!.getBoundingClientRect();
      return { icon: icon.top, label: label.top + label.height / 2, bottom: b.getBoundingClientRect().bottom };
    }),
  );
  expect(tiles).toHaveLength(3);
  for (const t of tiles.slice(1)) {
    expect(Math.abs(t.icon - tiles[0].icon)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.label - tiles[0].label)).toBeLessThanOrEqual(1);
  }
  // The empty band between the tiles and the total panel stays under 30% of the screen (U2).
  const panelTop = await page.locator("section.rounded-t-\\[48px\\]").evaluate((s) => s.getBoundingClientRect().top);
  expect((panelTop - tiles[0].bottom) / 1920).toBeLessThan(0.3);

  await page.getByRole("button", { name: "카드", exact: true }).click();
  const insert = page.getByRole("button", { name: "카드 넣기" });
  await expect(insert).toBeVisible();
  const gap = await insert.evaluate((b) => {
    const panel = document.querySelector("section.rounded-t-\\[48px\\]")!.getBoundingClientRect();
    return panel.top - b.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(32);
});

/** The phone opened on a fresh kiosk session's claim URL, at the video's phone size. */
async function openPhone(page: Page, request: APIRequestContext) {
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string; kioskToken: string };
  await page.goto(created.claimUrl);
  const key = `kibo.phone.${created.sessionId}`;
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  let seq = 0;
  const phone = (type: string, args: object = {}, extra: object = {}) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, source: "voice", utteranceSeq: ++seq, ...extra });
  const kiosk = (type: string) => command(request, created.kioskToken, { sessionId: created.sessionId, type, source: "touch" });
  return { phone, kiosk };
}

const screenOf = (page: Page) => page.locator("[data-phone-screen]");

test("phone dock: [Type] and the voice switch sit the same distance from their edges (F13)", async ({ page, request }) => {
  await openPhone(page, request);
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "talk");
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();
  const type = await page.getByRole("button", { name: "Type", exact: true }).boundingBox();
  const voice = await page.getByRole("switch").boundingBox();
  const width = page.viewportSize()!.width;
  const left = type!.x + type!.width / 2;
  const right = width - (voice!.x + voice!.width / 2);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
});

test("phone done: the order number's tracking is balanced, so the digits centre on the card (F10)", async ({ page, request }) => {
  const s = await openPhone(page, request);
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await s.phone("addToCart", HERO[1]);
  const review = await s.phone("requestCheckout");
  await s.phone("confirmCheckout", {}, { source: "button", cartVersion: review.cartVersion });
  await s.kiosk("cardAction");
  await expect(screenOf(page)).toHaveAttribute("data-phone-screen", "done");
  // Letter spacing adds its space after the last digit too; a left padding of the same size cancels it.
  const style = await page.locator("p.font-display").first().evaluate((p) => {
    const cs = getComputedStyle(p);
    return { spacing: parseFloat(cs.letterSpacing), padLeft: parseFloat(cs.paddingLeft) };
  });
  expect(style.spacing).toBeGreaterThan(0);
  expect(Math.abs(style.padLeft - style.spacing)).toBeLessThanOrEqual(0.5);
});
