import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command, readClaim } from "../helpers";
import { LEARNED, qaState, type Findings } from "./checks";

// UI QA of /learned/doughhouse: KIBO's widget over the learned kiosk page (QR, phone connected, bridge status).
// The kiosk page itself is third-party and shown unchanged, so it is judged on the screenshots only.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({
  viewport: VIEWPORTS[0],
  // Its own address for the dev server's per-IP limit, shared with the other QA specs otherwise (I-068).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.21" },
});

async function check(page: Page, info: TestInfo, state: string) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    const f: Findings = await qaState(page, info, LEARNED, state);
    expect.soft(f.h, `${state} ${vp.width}x${vp.height}: H failures`).toEqual([]);
    if (STRICT) expect.soft(f.t, `${state} ${vp.width}x${vp.height}: T misses`).toEqual([]);
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test("learned kiosk widget: QR, then an order the bridge entered", async ({ page, request }, info) => {
  await page.goto("/learned/doughhouse");
  const { sessionId, claimToken } = await readClaim(page);
  await check(page, info, "widget-qr");

  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  const widget = page.locator("[data-learned-widget]");
  const phone = (type: string, args: object, utteranceSeq: number) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
  await phone("setDineOption", { option: "eat_in" }, 1);
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await phone("addToCart", { itemId: "margherita", qty: 1, selections: { size: ["regular"], dough: ["original"] } }, 2);
  await expect(widget).toContainText("Added: Margherita");
  await check(page, info, "widget-added");
});
