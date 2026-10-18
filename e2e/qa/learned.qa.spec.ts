import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { claim, command, readClaim } from "../helpers";
import { LEARNED, qaShot, qaState, type Findings } from "./checks";

// UI QA of /learned/doughhouse: KIBO's panel beside the learned kiosk page (what it is, QR and code, phone connected,
// what the bridge tapped) and the numbered tap marks over the page (14-final:3).
// The kiosk page itself is not KIBO's UI (our development kiosk, learned by KIBO Learn) and is shown unchanged, so it is judged on the screenshots only.

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

test("learned kiosk widget: QR, then an order the bridge entered, with its taps drawn", async ({ page, request }, info) => {
  await page.goto("/learned/doughhouse");
  const { sessionId, claimToken } = await readClaim(page);
  // Drawn large enough to read (14-final:3): ≥ 0.8× at the judge laptop size.
  expect(Number(await page.locator("iframe[data-learned-kiosk]").getAttribute("data-page-scale"))).toBeGreaterThanOrEqual(0.8);
  await check(page, info, "widget-qr");

  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  const widget = page.locator("[data-learned-widget]");
  const phone = (type: string, args: object, utteranceSeq: number) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
  await phone("setDineOption", { option: "eat_in" }, 1);
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");

  // A longer pause per tap, so the screenshots catch a numbered mark at 1440 and then at 1280 wide.
  const pause = (ms: number) => page.evaluate((v) => ((window as { __kiboTapPauseMs?: number }).__kiboTapPauseMs = v), ms);
  await pause(2_500);
  await phone("addToCart", { itemId: "margherita", qty: 1, selections: { size: ["regular"], dough: ["original"] } }, 2);
  await expect(page.locator('[data-tap-mark="2"]')).toBeVisible();
  await qaShot(page, info, LEARNED, "widget-tapping");
  await page.setViewportSize(VIEWPORTS[1]);
  await expect(page.locator('[data-tap-mark="3"]')).toBeVisible();
  await qaShot(page, info, LEARNED, "widget-tapping");
  await pause(0);
  await page.setViewportSize(VIEWPORTS[0]);

  await expect(widget.locator("[data-replay-caption]")).toHaveAttribute("data-replay-caption", "ok");
  await expect(widget).toContainText("Added: Margherita. KIBO tapped 피자 → 마르게리따");
  await expect(widget).toContainText("kiosk total 15,900원 ✓ matches");
  await expect(page.locator("[data-tap-mark]")).toHaveCount(0);
  await check(page, info, "widget-added");
});

test.describe(() => {
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.152" } });

  // The snack bar KIBO learned blind (bk9-bunsik, I-405): a page of its own fixed 720×1280 size, drawn as large as fits.
  test("learned snack bar widget: QR, then the set the bridge entered through its three-step popup", async ({ page, request }, info) => {
    await page.goto("/learned/bunsik");
    const { sessionId, claimToken } = await readClaim(page);
    const frame = page.locator("iframe[data-learned-kiosk]");
    await expect(frame).toHaveAttribute("data-page-scale", /\d/);
    // The page keeps its own size, whole and as tall as the screen at the judge laptop size.
    const box = (await frame.boundingBox())!;
    expect(Math.round(box.height)).toBe(900);
    expect(Math.round(box.width)).toBe(Math.round((900 * 720) / 1280));
    await check(page, info, "bunsik-widget-qr");

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    const widget = page.locator("[data-learned-widget]");
    const phone = (type: string, args: object, utteranceSeq: number) =>
      command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq });
    await phone("setDineOption", { option: "eat_in" }, 1);
    await expect(widget).toHaveAttribute("data-bridge-ok", "true");
    const pause = (ms: number) => page.evaluate((v) => ((window as { __kiboTapPauseMs?: number }).__kiboTapPauseMs = v), ms);
    await pause(2_500);
    await phone(
      "addToCart",
      { itemId: "boribyeol_set", qty: 1, selections: { set_tteok: ["tteok_cheese"], set_spice: ["lv2"], set_gimbap: ["gimbap_kimchi"], set_gimbap_cut: ["whole"], set_drink: ["drink_cola"] } },
      2,
    );
    // Mark 3 is the cheese tteokbokki in the set's first step, over the kiosk's own popup.
    await expect(page.locator('[data-tap-mark="3"]')).toBeVisible({ timeout: 15_000 });
    await qaShot(page, info, LEARNED, "bunsik-widget-tapping");
    await pause(0);
    await expect(widget.locator("[data-replay-caption]")).toHaveAttribute("data-replay-caption", "ok", { timeout: 30_000 });
    await expect(widget).toContainText("Added: Boribyeol set. KIBO tapped 세트 → 보리별 세트 → 치즈 떡볶이");
    await expect(widget).toContainText("kiosk total 10,900원 ✓ matches");
    await check(page, info, "bunsik-widget-added");
  });
});
