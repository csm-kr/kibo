import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command } from "../helpers";
import { DEMO, KIOSK, PHONE, qaState, type Findings, type Profile } from "./checks";

// UI QA of the busy line while a refused session stream waits to reconnect (I-033): the kiosk strip (KX, Korean),
// the phone's pill above the dock (PX) and the /demo phone half before the session arrives (D2). The browser answers
// the events route with the server's 429, as e2e/stream-retry.spec.ts does.

const STRICT = process.env.QA_ALL === "1";

test.use({ locale: "en-US", extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.53" } });

const EVENTS = "**/api/session/*/events";

async function refuseStreams(page: Page) {
  await page.route(EVENTS, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many open screens. Please close one and try again." } }),
    }),
  );
}

async function check(page: Page, info: TestInfo, p: Profile, state: string) {
  const f: Findings = await qaState(page, info, p, state);
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

test("kiosk KX retrying", async ({ page }, info) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await refuseStreams(page);
  await page.goto("/kiosk?k=malo");
  await expect(page.locator("[data-stream-retrying]")).toBeVisible();
  await check(page, info, KIOSK, "KX-retrying");
});

test("/demo D2 retrying", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await refuseStreams(page);
  await page.goto("/demo?k=malo");
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  await expect(page.locator("[data-demo-check]").getByText("Busy right now. Reconnecting…")).toBeVisible();
  await check(page, info, DEMO, "D2-retrying");
});

/** The first frame the real events route sends (the public session), read from Node and then closed. */
async function firstFrame(baseURL: string, sessionId: string): Promise<string> {
  const res = await fetch(`${baseURL}/api/session/${sessionId}/events`, { headers: { "X-Forwarded-For": "192.0.2.53" } });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n\n")) text += decoder.decode((await reader.read()).value, { stream: true });
  await reader.cancel();
  return text.slice(0, text.indexOf("\n\n") + 2);
}

test("phone PX retrying", async ({ page, request, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = (await (await request.post("/api/session", { data: { kioskId: "malo" } })).json()) as {
    sessionId: string;
    claimUrl: string;
  };
  const claimed = await claim(request, created.sessionId, new URL(created.claimUrl).hash.replace(/^#t=/, ""));
  const { deviceToken } = (await claimed.json()) as { deviceToken: string };
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [`kibo.phone.${created.sessionId}`, deviceToken]);
  const phone = (type: string, args: object, extra: { source: string; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId: created.sessionId, type, args, ...extra });
  await phone("setDineOption", { option: "eat_in" }, { source: "button" });
  await phone("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } }, { source: "voice", utteranceSeq: 1 });
  // The first stream delivers the order and ends; EventSource reconnects into the refusal and keeps the order.
  const frame = await firstFrame(baseURL!, created.sessionId);
  let served = false;
  await page.route(EVENTS, (route) => {
    if (served)
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many open screens. Please close one and try again." } }),
      });
    served = true;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: frame });
  });
  await page.goto(`/assistant?s=${created.sessionId}`);
  await page.getByRole("button", { name: "Type instead" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Busy right now. Reconnecting…" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: /Your order/ }).locator("li")).toHaveCount(1);
  await check(page, info, PHONE, "PX-retrying");
});
