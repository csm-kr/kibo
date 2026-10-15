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

test("K8: the order number sits in the top third, with a receipt of what was paid under it (#1 item 20)", async ({ page, request }) => {
  await kioskWithHero(page, request);
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: "결제하기" }).click();
  await page.getByRole("button", { name: "카드", exact: true }).click();
  await page.getByRole("button", { name: "카드 넣기" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  const number = page.getByRole("heading", { name: "주문 번호" });
  await expect(number).toBeVisible();

  // The number's card: its middle in the top third of the 1920px canvas (it was at 0.48).
  const card = await number.locator("..").boundingBox();
  expect(card).not.toBeNull();
  expect((card!.y + card!.height / 2) / 1920).toBeLessThanOrEqual(0.36);

  // Under it, each paid line with its options, quantity and price, then the total, from the session's cart.
  const receipt = page.getByRole("region", { name: "주문 내역" });
  await expect(receipt.getByRole("listitem")).toHaveCount(2);
  const first = receipt.getByRole("listitem").first();
  await expect(first).toContainText("치즈버거 세트 ×1");
  await expect(first).toContainText("감자튀김 M · 제로콜라 · 피클 빼기");
  await expect(first).toContainText("6,900원");
  await expect(receipt.getByRole("listitem").nth(1)).toContainText("감자튀김 M · 사이다");
  await expect(receipt).toContainText("총 결제 금액");
  await expect(receipt).toContainText("13,800원");
  const box = await receipt.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
  // Inside the canvas, above the countdown that takes the kiosk back to K1.
  const timer = await page.getByRole("timer").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(timer!.y);
  expect(timer!.y + timer!.height).toBeLessThanOrEqual(1920);
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

/**
 * The kiosk canvas on /demo, and the dark band beside it: the part of the box it is drawn in that it leaves uncovered,
 * when that box has a background (KioskCanvas fills it with the kiosk's dark frame).
 */
function kioskBox(page: Page) {
  return page.locator("[data-kiosk-canvas]").evaluate((c) => {
    const r = c.getBoundingClientRect();
    const frame = c.parentElement as HTMLElement;
    const f = frame.getBoundingClientRect();
    const painted = getComputedStyle(frame).backgroundColor !== "rgba(0, 0, 0, 0)";
    const uncovered = Math.max(r.left - f.left, f.right - r.right, r.top - f.top, f.bottom - r.bottom);
    return { top: r.top, height: r.height, scale: r.width / 1080, darkBand: painted ? Math.max(0, uncovered) : 0 };
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
    // The step line and the card reader take height here, which once left a dark band of 49.5px on each side.
    expect((await kioskBox(page)).darkBand).toBeLessThanOrEqual(0.5);
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

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`/demo at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.83" } });

    test("the kiosk keeps one size and place from D2 to D3; its English step sits in a fixed area under it (#1 item 19)", async ({ page, request }) => {
      const s = await startDemo(page);
      let seq = 0;
      const ai = (type: string, args: object) =>
        command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "voice", utteranceSeq: ++seq });
      const step = page.locator("[data-kiosk-step]");
      const seen: { state: string; top: number; height: number; scale: number; darkBand: number }[] = [];
      const record = async (state: string) => seen.push({ state, ...(await kioskBox(page)) });

      // The dine and menu steps get their English line too (I-248), in the same area as the later ones.
      await expect(step).toHaveText("Kiosk: eat here or take out. Answer on the phone or on the kiosk.");
      await record("dine");
      await ai("setDineOption", { option: "eat_in" });
      await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
      await expect(step).toHaveText("Kiosk: menu. Your order shows at the bottom of the kiosk.");
      await record("menu");
      for (const args of HERO) await ai("addToCart", args);
      await expect(page.locator("[data-kiosk-subtitle]")).toBeVisible();
      await record("menu with the subtitle");
      await ai("requestCheckout", {});
      await expect(kioskRoot(page)).toHaveAttribute("data-screen", "review");
      await record("review");
      await page.getByRole("button", { name: "Yes, pay now" }).click();
      await expect(kioskRoot(page)).toHaveAttribute("data-screen", "payment");
      const reader = page.locator("[data-card-reader]").getByRole("button", { name: "Kiosk: insert card (demo)" });
      await expect(reader).toBeInViewport({ ratio: 1 });
      // Its label stays on one line in the narrower column (U8).
      const labelLines = await reader.evaluate((button) => {
        const text = [...button.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        const range = document.createRange();
        if (text) range.selectNodeContents(text);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      });
      expect(labelLines).toBe(1);
      await record("payment");
      await reader.click();
      await expect(kioskRoot(page)).toHaveAttribute("data-screen", "done");
      await record("receipt question");
      await page.getByRole("button", { name: "출력 안 함" }).click();
      await expect(page.getByRole("heading", { name: "주문 번호" })).toBeVisible();
      await record("order number");

      // U5: within 0.5px of where it started, at every step.
      const [first] = seen;
      for (const at of seen) {
        expect.soft(Math.abs(at.top - first.top), `${at.state}: top ${at.top} vs ${first.top}`).toBeLessThanOrEqual(0.5);
        expect.soft(Math.abs(at.height - first.height), `${at.state}: height ${at.height} vs ${first.height}`).toBeLessThanOrEqual(0.5);
        expect.soft(Math.abs(at.scale - first.scale), `${at.state}: scale ${at.scale} vs ${first.scale}`).toBeLessThanOrEqual(0.0005);
        expect.soft(at.darkBand, `${at.state}: dark band beside the kiosk (#1 item 10)`).toBeLessThanOrEqual(0.5);
      }
      // Level with the phone column: both start under their caption rows.
      const phoneTop = await page.locator("[data-phone-screen]").evaluate((el) => el.getBoundingClientRect().top);
      expect(Math.abs(first.top - phoneTop)).toBeLessThanOrEqual(0.5);
    });
  });
}
