import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

// Shared steps for the kiosk E2E specs. The "phone" here is plain HTTP calls with the device token,
// the same calls /assistant will make.

/** Opens the /demo scenario guide unless it is open already (it opens by default from 1440px wide). */
export async function openScenarios(page: Page): Promise<void> {
  const toggle = page.locator("[data-scenario-guide]").getByRole("button", { name: "Scenarios", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** The kiosk root; `data-screen` names the screen (attract, dine, menu, review, payment, done). */
/** How many lines the element's text wraps to: one rect per line box for a range over its contents. */
export function textLines(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  });
}

/**
 * The hints that would be cut in this text field: each is measured in the field's own font against the room beside
 * [Send] (I-133, R-019). The web font's Korean slices load only for text on screen, so the ones the hints need load first.
 */
export function hintsCut(field: Locator, hints: string[]): Promise<string[]> {
  return field.evaluate(async (el: HTMLInputElement, hints) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    await document.fonts.load(ctx.font, hints.join(""));
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return hints.filter((h) => ctx.measureText(h).width > room);
  }, hints);
}

export function kioskRoot(page: Page): Locator {
  return page.locator("[data-screen]").first();
}

/** A button whose text includes an element with exactly this text (tile and choice names are not unique prefixes). */
export function buttonWithText(scope: Page | Locator, text: string): Locator {
  // The inner locator is matched inside each button, so it must be rooted at the page, not at `scope`.
  const page = "page" in scope ? scope.page() : scope;
  return scope.locator("button").filter({ has: page.getByText(text, { exact: true }) });
}

/** Waits for the attract QR and returns its claim URL split into session id and claim token. */
export async function readClaim(page: Page): Promise<{ url: string; sessionId: string; claimToken: string }> {
  const qr = page.locator("img[data-claim-url]");
  await expect(qr).toBeVisible();
  const url = (await qr.getAttribute("data-claim-url")) ?? "";
  const parsed = new URL(url);
  return { url, sessionId: parsed.searchParams.get("s") ?? "", claimToken: parsed.hash.replace(/^#t=/, "") };
}

export async function claim(request: APIRequestContext, sessionId: string, claimToken: string) {
  return request.post("/api/session/claim", { data: { sessionId, claimToken } });
}

export async function command(
  request: APIRequestContext,
  token: string,
  body: { sessionId: string; type: string; args?: object; source: string; cartVersion?: number; utteranceSeq?: number },
) {
  const res = await request.post("/api/command", {
    headers: { Authorization: `Bearer ${token}` },
    data: { commandId: randomUUID(), args: {}, ...body },
  });
  const json = await res.json();
  expect(json.ok, `${body.type}: ${JSON.stringify(json.error)}`).toBe(true);
  return json as { status: string; total: number; cartVersion: number; cart: unknown[] };
}

/**
 * The dev server compiles a route on its first request and may reload the page while it does, which can cut a
 * claim in half. Specs that open /assistant first load it once with no session and touch the routes it calls.
 */
export async function warmPhone(browser: Browser, request: APIRequestContext) {
  await Promise.all([
    request.post("/api/session/claim", { data: {} }),
    request.post("/api/ping", { data: {} }),
    request.post("/api/chat", { data: {} }),
    request.get(`/api/session/${"x".repeat(22)}/events`),
  ]);
  const page = await browser.newPage();
  await page.goto("/assistant");
  await expect(page.locator('[data-phone-screen="ended"]')).toBeVisible({ timeout: 60_000 });
  await page.close();
}

/** The standalone kiosk keeps {sessionId, kioskToken, claimUrl, pairCode} in localStorage (useKioskSession). */
export async function storedKioskSession(page: Page, kioskId = "malo") {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `kibo.kiosk.${kioskId}`);
  return JSON.parse(raw ?? "null") as { sessionId: string; kioskToken: string; claimUrl: string; pairCode?: string };
}

export interface SetOrder {
  side: "감자튀김 M" | "감자튀김 L";
  drink: string;
  noPickles?: boolean;
}

/** Cheeseburger → set → side → drink → ingredients → 담기, all inside the K4 sheet. */
export async function addCheeseburgerSet(page: Page, order: SetOrder) {
  await buttonWithText(page, "치즈버거").click();
  const sheet = page.getByRole("dialog", { name: "치즈버거" });
  await expect(sheet).toBeVisible();
  await buttonWithText(sheet, "세트").click();
  await sheet.getByRole("button", { name: "다음", exact: true }).click();

  const fries = buttonWithText(sheet, order.side);
  if ((await fries.getAttribute("aria-pressed")) !== "true") await fries.click();
  await expect(fries).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "다음", exact: true }).click();

  await buttonWithText(sheet, order.drink).click();
  await sheet.getByRole("button", { name: "다음", exact: true }).click();

  if (order.noPickles) await buttonWithText(sheet, "피클 빼기").click();
  await sheet.getByRole("button", { name: "담기", exact: true }).click();
  await expect(sheet).toBeHidden();
}
