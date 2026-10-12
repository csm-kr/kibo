import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buttonWithText, claim, command, kioskRoot, readClaim } from "../helpers";
import { KIOSK, qaShot, qaState, type Findings } from "./checks";

// UI QA of every kiosk screen (docs/UX.md screen map K1–K8, KX) on the 1080x1920 design canvas. States are
// reached through the real UI and the API, never by mocking components. H failures fail the run; T misses only
// with QA_ALL=1.

test.use({ viewport: { width: 1080, height: 1920 } });

const STRICT = process.env.QA_ALL === "1";

async function check(page: Page, info: TestInfo, state: string, afterShot?: () => Promise<void>) {
  const f: Findings = await qaState(page, info, KIOSK, state, { afterShot });
  expect.soft(f.h, `${state}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${state}: T misses`).toEqual([]);
}

test("touch path: K1 to K8", async ({ page }, info) => {
  // A fake clock that runs normally, so the K8 countdowns can be moved back while the checks run.
  await page.clock.install();
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  await readClaim(page);
  // The touch button is disabled until the session arrives through the stream.
  await expect(page.getByRole("button", { name: /화면을 눌러서 주문/ })).toBeEnabled();
  await check(page, info, "K1-attract");

  // The scaled size /demo uses, for the record; sizes are measured on the full canvas only.
  await page.setViewportSize({ width: 600, height: 1067 });
  await expect.poll(() => page.locator("[data-kiosk-canvas]").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(700);
  await qaShot(page, info, KIOSK, "K1-attract-scaled");
  await page.setViewportSize({ width: 1080, height: 1920 });
  await expect.poll(() => page.locator("[data-kiosk-canvas]").evaluate((el) => el.getBoundingClientRect().width)).toBe(1080);

  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await expect(root).toHaveAttribute("data-screen", "dine");
  await check(page, info, "K2-dine");

  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");
  // The burger category holds the sold-out shrimp burger.
  await expect(buttonWithText(page, "새우버거")).toBeDisabled();
  await check(page, info, "K3-menu-sold-out");

  await buttonWithText(page, "치즈버거").click();
  const sheet = page.getByRole("dialog", { name: "치즈버거" });
  await expect(sheet.getByText("세트로 드릴까요?")).toBeVisible();
  await check(page, info, "K4-variant");

  await buttonWithText(sheet, "세트").click();
  await sheet.getByRole("button", { name: "다음", exact: true }).click();
  await sheet.getByRole("button", { name: "다음", exact: true }).click();
  await expect(buttonWithText(sheet, "제로콜라")).toHaveAttribute("aria-pressed", "false");
  await check(page, info, "K4-drink-empty");

  await buttonWithText(sheet, "제로콜라").click();
  await sheet.getByRole("button", { name: "다음", exact: true }).click();
  await expect(buttonWithText(sheet, "피클 빼기")).toBeVisible();
  await check(page, info, "K4-ingredients");

  await sheet.getByRole("button", { name: "담기", exact: true }).click();
  const upsell = page.getByRole("dialog", { name: "디저트도 함께 드릴까요?" });
  await expect(upsell).toBeVisible();
  await check(page, info, "K5-upsell");

  await upsell.getByRole("button", { name: "괜찮아요" }).click();
  await page.getByRole("button", { name: "사이드", exact: true }).click();
  await buttonWithText(page, "감자튀김 M").click();
  await page.getByRole("dialog", { name: "감자튀김 M" }).getByRole("button", { name: "담기", exact: true }).click();
  await expect(page.getByText(/개 담음$/)).toHaveText("2개 담음");
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(page.locator('[data-screen="review"] ul > li')).toHaveCount(2);
  await check(page, info, "K6-review");

  await page.getByRole("button", { name: "결제하기" }).click();
  await expect(root).toHaveAttribute("data-screen", "payment");
  await page.getByRole("button", { name: "카드", exact: true }).click();
  await expect(page.getByRole("heading", { name: "카드를 아래 투입구에 넣어 주세요" })).toBeVisible();
  await check(page, info, "K7-card-insert");

  await page.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  // The receipt checks take about a second, well inside its 10 s countdown.
  await check(page, info, "K8-receipt");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.getByRole("heading", { name: "주문 번호" })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("초 후 처음 화면으로 돌아가요");
  // The last screen: after the screenshot the page clock goes back a minute, so the countdown cannot end during
  // the checks. Pausing the clock instead would also stop axe, which uses timers.
  await check(page, info, "K8-order-number", async () =>
    page.clock.setSystemTime((await page.evaluate(() => Date.now())) - 60_000),
  );
});

test("phone path: AI highlight on K3 and the staff banner", async ({ page, request }, info) => {
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  const { sessionId, claimToken } = await readClaim(page);
  const claimed = await claim(request, sessionId, claimToken);
  expect(claimed.status()).toBe(200);
  const { deviceToken } = await claimed.json();
  await expect(root).toHaveAttribute("data-screen", "dine");

  await command(request, deviceToken, {
    sessionId,
    type: "addToCart",
    args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } },
    source: "voice",
    utteranceSeq: 1,
  });
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(buttonWithText(page, "치즈버거")).toHaveClass(/k-ring/);
  // The screenshot is taken first, inside the 2 s highlight.
  await check(page, info, "K3-ai-highlight");

  await command(request, deviceToken, { sessionId, type: "callStaff", args: { reasonCode: "user_request" }, source: "button" });
  await expect(page.getByText("직원을 불렀어요. 잠시만 기다려 주세요.")).toBeVisible();
  await check(page, info, "KX-staff");
});

test("idle warning one minute before expiry", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  await readClaim(page);
  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");

  // Sessions expire 10 min after the last activity (docs/ARCHITECTURE.md). Moving only the page clock 9.5 min ahead
  // shows the warning without waiting; the next 30 s ping re-measures the offset and hides it again.
  await page.clock.setSystemTime(Date.now() + 9.5 * 60_000);
  await expect(page.getByRole("alertdialog", { name: "계속 주문하시겠어요?" })).toBeVisible();
  await check(page, info, "KX-idle-warning");
});
