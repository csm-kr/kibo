import { expect, test, type Page } from "@playwright/test";
import { command } from "./helpers";

// The /demo frame (issue #1 batch E, mockup A "Clean studio"): a slim top bar with the place tabs over D1, D2 and D3,
// and three white column cards. Measured in CSS px at the judge sizes; no model calls (/api/chat is answered by the test).

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test.use({
  viewport: SIZES[2],
  locale: "en-US",
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.90" },
});

interface DemoSession {
  sessionId: string;
  deviceToken: string;
  kioskToken: string;
}

async function start(page: Page, kioskId = "malo"): Promise<DemoSession> {
  await page.goto(`/demo?k=${kioskId}`);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  return (await (await created).json()) as DemoSession;
}

const bar = (page: Page) => page.locator("[data-demo-topbar]");
const places = (page: Page) => bar(page).getByRole("navigation", { name: "Places" });

async function expectBar(page: Page, current: string, at: string) {
  await expect(bar(page).getByRole("img", { name: "KIBO" }), at).toBeVisible();
  await expect(bar(page).getByText("Live demo", { exact: true }), at).toBeVisible();
  const hrefs = { "Burger shop": "/demo?k=malo", "Airport rail": "/demo?k=airport_rail", "Pizza shop": "/demo?k=doughhouse" };
  for (const [name, href] of Object.entries(hrefs)) {
    const tab = places(page).getByRole("link", { name, exact: true });
    await expect(tab, `${at}: ${name}`).toHaveAttribute("href", href);
    if (name === current) await expect(tab, `${at}: ${name} selected`).toHaveAttribute("aria-current", "page");
    else await expect(tab, `${at}: ${name} not selected`).not.toHaveAttribute("aria-current", /.+/);
  }
  await expect(bar(page).getByRole("link", { name: "How it works" }), at).toHaveAttribute("href", "/#how");
}

test("D1, D2 and D3 share one top bar: KIBO, Live demo, the place tabs with the current place selected, How it works (#1 E)", async ({ page, request }) => {
  await page.goto("/demo?k=airport_rail");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 60_000 });
  await expectBar(page, "Airport rail", "D1");
  const d1 = await bar(page).boundingBox();

  // Keyboard: the tabs are in the tab order, before the page's own content.
  await page.locator("body").focus();
  const reached: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
  }
  expect(reached).toEqual(expect.arrayContaining(["Burger shop", "Airport rail", "Pizza shop"]));

  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as DemoSession;
  await expect(page.locator("[data-phone-screen]")).toBeVisible();
  await expectBar(page, "Airport rail", "D2");
  // U5: the bar does not move between the screens.
  expect(await bar(page).boundingBox()).toEqual(d1);

  let seq = 0;
  const ai = (type: string, args: object) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: ["adult"] } });
  await ai("requestCheckout", {});
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(page.locator("[data-demo-end]")).toBeVisible();
  await expectBar(page, "Airport rail", "D3");
  expect(await bar(page).boundingBox()).toEqual(d1);
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.91" } });

  test("a place tab starts that place fresh; with order lines not yet paid it asks first (#1 E, N5)", async ({ page, request }) => {
    // An empty order: straight to the other place's start, as Try another place does.
    await start(page);
    await places(page).getByRole("link", { name: "Pizza shop" }).click();
    await expect(page).toHaveURL(/\/demo\?k=doughhouse$/);
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();

    // Lines in the order: one plain question first; keeping the order changes nothing.
    const s = await start(page);
    await command(request, s.deviceToken, { sessionId: s.sessionId, type: "setDineOption", args: { option: "eat_in" }, source: "button" });
    await command(request, s.deviceToken, {
      sessionId: s.sessionId,
      type: "addToCart",
      args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } },
      source: "voice",
      utteranceSeq: 1,
    });
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);
    await places(page).getByRole("link", { name: "Airport rail" }).click();
    const ask = page.getByRole("dialog", { name: "Start over at Airport rail?" });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("This order is cleared.");
    // The safe answer has focus (N5).
    await expect(ask.getByRole("button", { name: "Keep this order" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/\/demo\?k=malo$/);
    await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(1);

    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await ask.getByRole("button", { name: "Keep this order" }).click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/\/demo\?k=malo$/);

    await places(page).getByRole("link", { name: "Airport rail" }).click();
    await ask.getByRole("button", { name: "Start over" }).click();
    await expect(page).toHaveURL(/\/demo\?k=airport_rail$/);
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  });

  test("after payment a place tab asks nothing: the order is done (#1 E)", async ({ page, request }) => {
    const s = await start(page);
    let seq = 0;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("setDineOption", { option: "eat_in" });
    await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cola"] } });
    await ai("requestCheckout", {});
    await page.getByRole("button", { name: "Yes, pay now" }).click();
    await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
    await expect(page.locator("[data-demo-end]")).toBeVisible();
    await places(page).getByRole("link", { name: "Pizza shop" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/demo\?k=doughhouse$/);
  });
});
