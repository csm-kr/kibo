import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { sameOrder, type OrderLine } from "@/lib/demo/compare";
import { evidencePath } from "../scripts/evidencePath";
import { addCheeseburgerSet, kioskRoot } from "./helpers";

// The hero order by touch the way a user who knows the order would tap it: large fries chosen in the sheet while
// adding each set, no clear-all, dessert declined. This is the touch side of the /demo comparison card (D3);
// e2e/kiosk-touch.spec.ts keeps the slower edit path (clear and add again).
//
// The evidence file is written only with EVIDENCE=1 (otherwise to test-results/evidence/), so a normal
// `npm run test:e2e` never changes the numbers the card and docs/TESTING.md cite (I-099).
// Re-measure: `EVIDENCE=1 npx playwright test kiosk-touch-efficient`.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limit (R-005): run right before kiosk-touch, it used up that spec's budget.
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.38" },
});

test("hero order by touch, efficient path: options chosen while adding", async ({ page }) => {
  await page.goto("/kiosk?k=malo&demo=1");
  const root = kioskRoot(page);
  const cartCount = page.getByText(/개 담음$/);

  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await expect(root).toHaveAttribute("data-screen", "dine");
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");
  await page.getByRole("button", { name: "버거", exact: true }).click();

  await addCheeseburgerSet(page, { side: "감자튀김 L", drink: "제로콜라", noPickles: true });
  const upsell = page.getByRole("dialog", { name: "디저트도 함께 드릴까요?" });
  await expect(upsell).toBeVisible();
  await upsell.getByRole("button", { name: "괜찮아요" }).click();
  await expect(upsell).toBeHidden();
  await addCheeseburgerSet(page, { side: "감자튀김 L", drink: "사이다" });
  await expect(cartCount).toHaveText("2개 담음");

  const checkout = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "requestCheckout",
  );
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  const reply = (await (await checkout).json()) as { ok: boolean; total: number; cart: (OrderLine & { lineId: string; unitPrice: number })[] };
  expect(reply.ok).toBe(true);
  // 2 x cheeseburger set 6,900 + 2 x large fries +500 (data/kiosks/malo.json), the same as the edit path.
  expect(reply.total).toBe(14800);
  expect(sameOrder(reply.cart)).toBe(true);

  await expect(root).toHaveAttribute("data-screen", "review");
  await page.getByRole("button", { name: "결제하기" }).click();
  await page.getByRole("button", { name: "카드", exact: true }).click();
  await page.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.getByRole("heading", { name: "주문 번호" })).toBeVisible();

  const counter = page.locator("[data-demo-counter]");
  const taps = Number(await counter.getAttribute("data-taps"));
  const seconds = Number(await counter.getAttribute("data-seconds"));
  // The cited touch count (evidence/touch-hero-efficient.json): a kiosk restyle must not change the path (14-final:2).
  expect(taps).toBe(24);

  writeFileSync(
    evidencePath("touch-hero-efficient.json"),
    `${JSON.stringify(
      {
        date: new Date().toISOString(),
        taps,
        seconds,
        total: reply.total,
        // Ids only, so the card can tell whether a judge's order is the same one.
        cart: reply.cart.map(({ itemId, variant, qty, selections }) => ({ itemId, variant, qty, selections })),
        note: "automated, efficient path: options chosen while adding; automated Playwright run on /kiosk, not a human timing",
      },
      null,
      2,
    )}\n`,
  );
});
