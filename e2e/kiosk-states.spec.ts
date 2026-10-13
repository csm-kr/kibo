import { expect, test } from "@playwright/test";
import { buttonWithText, command, kioskRoot, readClaim, storedKioskSession } from "./helpers";

test.use({ viewport: { width: 1080, height: 1920 } });

/** KST minutes since midnight; the breakfast items sell 05:00–10:30 (data/kiosks/malo.json). */
function kstMinutes(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

test("sold-out and out-of-hours tiles cannot be tapped", async ({ page }) => {
  await page.goto("/kiosk?k=malo");
  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");

  const shrimp = buttonWithText(page, "새우버거");
  await expect(shrimp).toBeDisabled();
  await expect(shrimp).toContainText("품절");

  const minutes = kstMinutes();
  test.skip(minutes >= 5 * 60 && minutes < 10 * 60 + 30, "breakfast hours in KST: the morning items are on sale");
  await page.getByRole("button", { name: "아침 메뉴", exact: true }).click();
  const muffin = buttonWithText(page, "에그 머핀");
  await expect(muffin).toBeDisabled();
  await expect(muffin).toContainText("지금은 판매하지 않아요");
});

test.describe("start over", () => {
  // Its own address: each start over creates a session (10 new sessions a minute per IP, I-068, R-005).
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.36" } });

  test("[처음으로] leaves an empty K2 at once and asks first on K3 with items; each gets a new QR", async ({ page }) => {
    await page.goto("/kiosk?k=malo");
    const root = kioskRoot(page);
    const first = await readClaim(page);
    await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
    await expect(root).toHaveAttribute("data-screen", "dine");
    await page.getByRole("button", { name: "처음으로", exact: true }).click();
    await expect(root).toHaveAttribute("data-screen", "attract");
    const second = await readClaim(page);
    expect(second.sessionId).not.toBe(first.sessionId);

    await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
    await page.getByRole("button", { name: "매장에서 먹기" }).click();
    await page.getByRole("button", { name: "사이드", exact: true }).click();
    await buttonWithText(page, "감자튀김 M").click();
    await page.getByRole("dialog", { name: "감자튀김 M" }).getByRole("button", { name: "담기", exact: true }).click();
    await expect(page.getByText(/개 담음$/)).toHaveText("1개 담음");
    await page.getByRole("button", { name: "처음으로", exact: true }).click();
    const ask = page.getByRole("alertdialog", { name: "주문을 취소하고 처음으로 갈까요?" });
    await ask.getByRole("button", { name: "취소하고 처음으로" }).click();
    await expect(root).toHaveAttribute("data-screen", "attract");
    const third = await readClaim(page);
    expect(third.sessionId).not.toBe(second.sessionId);
  });
});

test("after payment the kiosk counts down and returns to the attract screen with a new QR", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  const before = await readClaim(page);
  const { sessionId, kioskToken } = await storedKioskSession(page);

  // Reach `paid` through the API as the kiosk; the touch path is covered by kiosk-touch.spec.ts.
  const kiosk = (type: string, args: object = {}, cartVersion?: number) =>
    command(request, kioskToken, { sessionId, type, args, source: "touch", cartVersion });
  await kiosk("startTouch");
  await kiosk("setDineOption", { option: "take_out" });
  await kiosk("addToCart", { itemId: "fries_m", variant: "single", qty: 1, selections: {} });
  const review = await kiosk("requestCheckout");
  await kiosk("confirmCheckout", {}, review.cartVersion);
  await kiosk("cardAction");

  await expect(root).toHaveAttribute("data-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.getByRole("timer")).toContainText("초 후 처음 화면으로 돌아가요");

  // The countdown is 10 s by design; this is the one fixed wait the spec allows.
  await expect(root).toHaveAttribute("data-screen", "attract", { timeout: 20_000 });
  const after = await readClaim(page);
  expect(after.sessionId).not.toBe(before.sessionId);
  expect(after.url).not.toBe(before.url);
});
