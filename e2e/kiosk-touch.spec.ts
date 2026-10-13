import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addCheeseburgerSet, kioskRoot } from "./helpers";

// The hero order by touch (docs/PRD.md "Demo scenario" step 2) on the 1080x1920 canvas, with the demo counter.
// The kiosk cannot change an option on a line already in the cart (real kiosks cannot either), so "both fries
// to large" is done the way a touch user would: clear the cart and add both sets again with large fries. This is the
// edit path; the /demo comparison uses e2e/kiosk-touch-efficient.spec.ts, which picks large fries while adding.

test.use({ viewport: { width: 1080, height: 1920 } });

test("hero order by touch reaches an order number with the server's total", async ({ page }) => {
  await page.goto("/kiosk?k=malo&demo=1");
  const root = kioskRoot(page);
  const cartCount = page.getByText(/개 담음$/);

  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).click();
  await expect(root).toHaveAttribute("data-screen", "dine");
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");
  await page.getByRole("button", { name: "버거", exact: true }).click();

  // First set: fries M kept, zero cola, no pickles. The dessert offer comes once, after the first burger.
  await addCheeseburgerSet(page, { side: "감자튀김 M", drink: "제로콜라", noPickles: true });
  const upsell = page.getByRole("dialog", { name: "디저트도 함께 드릴까요?" });
  await expect(upsell).toBeVisible();
  await upsell.getByRole("button", { name: "괜찮아요" }).click();
  await expect(upsell).toBeHidden();

  await addCheeseburgerSet(page, { side: "감자튀김 M", drink: "사이다" });
  await expect(cartCount).toHaveText("2개 담음");

  // Both fries to large: clear and add again.
  await page.getByRole("button", { name: "전체 삭제" }).click();
  await page.getByRole("button", { name: "모두 지우기" }).click();
  await expect(page.getByText("메뉴를 골라 주세요")).toBeVisible();
  await addCheeseburgerSet(page, { side: "감자튀김 L", drink: "제로콜라", noPickles: true });
  await addCheeseburgerSet(page, { side: "감자튀김 L", drink: "사이다" });
  await expect(cartCount).toHaveText("2개 담음");

  const order = page.getByRole("button", { name: "주문하기", exact: true });
  await expect(order).toBeEnabled();
  const checkout = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "requestCheckout",
  );
  await order.click();
  const reply = await (await checkout).json();
  expect(reply.ok).toBe(true);
  // 2 x cheeseburger set 6,900 + 2 x large fries +500 (data/kiosks/malo.json).
  expect(reply.total).toBe(14800);

  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(page.locator('[data-screen="review"] ul > li')).toHaveCount(2);
  await expect(page.getByText("14,800원", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "결제하기" }).click();
  await expect(root).toHaveAttribute("data-screen", "payment");
  await page.getByRole("button", { name: "카드", exact: true }).click();
  await expect(page.getByRole("heading", { name: "카드를 아래 투입구에 넣어 주세요" })).toBeVisible();
  await page.getByRole("button", { name: "카드 넣기" }).click();
  await expect(page.getByText("승인 중…")).toBeVisible();

  await expect(root).toHaveAttribute("data-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.getByRole("heading", { name: "주문 번호" })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("초 후 처음 화면으로 돌아가요");

  const counter = page.locator("[data-demo-counter]");
  const taps = Number(await counter.getAttribute("data-taps"));
  const seconds = Number(await counter.getAttribute("data-seconds"));
  expect(taps).toBeGreaterThan(0);

  // Evidence for docs/TESTING.md (R-001). An automated run, so the seconds are not a human timing.
  mkdirSync("evidence", { recursive: true });
  writeFileSync(
    "evidence/touch-hero.json",
    `${JSON.stringify(
      {
        date: new Date().toISOString(),
        taps,
        seconds,
        total: reply.total,
        note: "automated Playwright run on /kiosk, not a human timing",
      },
      null,
      2,
    )}\n`,
  );
});
