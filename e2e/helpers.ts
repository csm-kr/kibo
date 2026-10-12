import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// Shared steps for the kiosk E2E specs. The "phone" here is plain HTTP calls with the device token,
// the same calls /assistant will make.

/** The kiosk root; `data-screen` names the screen (attract, dine, menu, review, payment, done). */
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

/** The standalone kiosk keeps {sessionId, kioskToken, claimUrl} in localStorage (useKioskSession). */
export async function storedKioskSession(page: Page, kioskId = "malo") {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `kibo.kiosk.${kioskId}`);
  return JSON.parse(raw ?? "null") as { sessionId: string; kioskToken: string; claimUrl: string };
}
