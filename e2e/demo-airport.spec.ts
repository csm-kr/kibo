import { expect, test, type Page } from "@playwright/test";
import { buttonWithText, command, kioskRoot } from "./helpers";

// /demo?k=airport_rail (docs/UX.md Flow C, USER_JOURNEY J2): the same phone panel drives the airport rail ticket
// machine, which has no dine question and ends with a reference number. No model calls: the AI's tool calls go
// through the API with the demo's device token. The @live test needs E2E_LIVE=1.

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (docs/RULE.md R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.26" },
});

interface DemoSession {
  sessionId: string;
  kioskToken: string;
  deviceToken: string;
}

async function startAirportDemo(page: Page): Promise<DemoSession> {
  await page.goto("/demo?k=airport_rail");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /SKYLINE AIRPORT RAIL/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: /MALO BURGER/ })).not.toHaveAttribute("aria-current", "true");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const json = (await (await created).json()) as DemoSession & { ok: boolean };
  expect(json.ok).toBe(true);
  await expect(page.getByRole("heading", { name: "Ticket machine · unchanged" })).toBeVisible();
  return json;
}

const phoneScreen = (page: Page) => page.locator("[data-phone-screen]");

test("airport rail on /demo: tickets on both halves, confirm, card stand-in, reference number", async ({ page, request }) => {
  const s = await startAirportDemo(page);
  // A ticket machine never asks eat-in or take-out: the phone goes straight to talking, with ticket examples.
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.getByText("Eat here or take out?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Two adult tickets to City Center on the express, please." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Type your order" })).toHaveAttribute("placeholder", "e.g. 2 adults");

  let seq = 0;
  const ai = (type: string, args: object = {}) =>
    command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });

  await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } });
  // Ticket words on the phone too (I-116, R-007).
  const cart = page.getByRole("region", { name: "Your tickets" });
  await expect(cart.getByText("Express to City Center", { exact: true })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
  const canvas = page.locator("[data-kiosk-canvas]");
  await expect(buttonWithText(canvas, "직통열차 시티센터")).toHaveClass(/k-ring/);
  await expect(canvas.getByText("21,000원").first()).toBeVisible();

  await ai("requestCheckout");
  await expect(page.getByRole("heading", { name: "Please check your tickets" })).toBeVisible();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");

  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "pay");
  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();

  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "done");
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "done");
  await expect(page.getByRole("heading", { name: "Reference number" })).toBeVisible();
  await expect(page.getByText("Please take your tickets from the machine.")).toBeVisible();
  const number = (await page.locator("[data-phone-screen] p.font-display").textContent()) ?? "";
  expect(number).toMatch(/^\d{3}$/);
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(canvas.getByRole("heading", { name: "참조 번호" })).toBeVisible();
  await expect(canvas.getByText(number, { exact: true })).toBeVisible();

  // D3: the two other places and the two-device mode of this kiosk.
  const others = page.getByRole("navigation", { name: "Try another place" });
  await expect(others.getByRole("link", { name: "Burger shop" })).toHaveAttribute("href", "/demo?k=malo");
  await expect(others.getByRole("link", { name: "Pizza shop" })).toHaveAttribute("href", "/demo?k=doughhouse");
  await expect(page.getByRole("link", { name: "Open two-device mode" })).toHaveAttribute("href", "/kiosk?k=airport_rail");
});

test("@live typing a ticket order reaches real Gemini and two adult express tickets land in the cart", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini; run `npm run test:e2e:live`");
  await startAirportDemo(page);
  await expect(phoneScreen(page)).toHaveAttribute("data-phone-screen", "talk");
  await page.getByRole("textbox", { name: "Type your order" }).fill("Two adult tickets to City Center on the express");
  await page.getByRole("button", { name: "Send" }).click();
  const cart = page.getByRole("region", { name: "Your tickets" });
  await expect(cart.getByText("Express to City Center", { exact: true })).toBeVisible({ timeout: 90_000 });
  // 2 x 10,500 adult fare (data/kiosks/airport_rail.json): the kiosk's own total.
  await expect(page.locator("[data-kiosk-canvas]").getByText("21,000원").first()).toBeVisible();
});
