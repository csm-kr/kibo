import { expect, test } from "@playwright/test";
import { buttonWithText, kioskRoot } from "./helpers";

// The kiosk screens driven by other data: the airport rail ticket machine (no dine option, passenger fares,
// ticket words) and MALO switched to English on K1 (docs/ISSUE.md I-019). 1080x1920 canvas.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (docs/RULE.md R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.24" },
});

test("airport rail: two express adults and one all-stop child reach a reference number", async ({ page }) => {
  await page.goto("/kiosk?k=airport_rail");
  const root = kioskRoot(page);

  // A ticket machine has no dine question: touch goes straight to the tickets.
  await page.getByRole("button", { name: /화면을 눌러서 구매/ }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");

  await buttonWithText(page, "직통열차 시티센터").click();
  const express = page.getByRole("dialog", { name: "직통열차 시티센터" });
  await expect(express.getByText("1/2 단계 · 승객")).toBeVisible();
  await expect(buttonWithText(express, "어른")).toHaveAttribute("aria-pressed", "true");
  await express.getByRole("button", { name: "다음", exact: true }).click();
  await expect(express.getByText("승차권 수")).toBeVisible();
  await express.getByRole("button", { name: "하나 더" }).click();
  await express.getByRole("button", { name: "선택", exact: true }).click();
  await expect(express).toBeHidden();

  await page.getByRole("button", { name: "일반열차", exact: true }).click();
  await buttonWithText(page, "일반열차 하버게이트").click();
  const allStop = page.getByRole("dialog", { name: "일반열차 하버게이트" });
  await buttonWithText(allStop, "어린이 (6–12세)").click();
  await allStop.getByRole("button", { name: "선택", exact: true }).click();
  await expect(allStop).toBeHidden();
  await expect(page.getByText(/장 선택$/)).toHaveText("3장 선택");

  const checkout = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "requestCheckout",
  );
  await page.getByRole("button", { name: "구매하기", exact: true }).click();
  const reply = await (await checkout).json();
  expect(reply.ok).toBe(true);
  // 2 x express 10,500 + Harbor Gate 1,600 with the child fare -800 (data/kiosks/airport_rail.json).
  expect(reply.total).toBe(21800);

  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(page.getByRole("heading", { name: "구매 내역을 확인해 주세요" })).toBeVisible();
  await expect(page.locator('[data-screen="review"] ul > li')).toHaveCount(2);
  await expect(page.getByText("21,800원", { exact: true })).toBeVisible();
  await expect(page.getByText("식사 장소")).toHaveCount(0);

  await page.getByRole("button", { name: "결제하기" }).click();
  await page.getByRole("button", { name: "카드", exact: true }).click();
  await page.getByRole("button", { name: "카드 넣기" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(page.getByRole("heading", { name: "참조 번호" })).toBeVisible();
  await expect(page.getByText("승차권을 받아 가세요")).toBeVisible();
});

test("MALO in English: K1 language button, then a cheeseburger set to an English review", async ({ page }) => {
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  // The kiosk starts in Korean (its default) and switches only for this order.
  await expect(page.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Order by touch/ }).click();
  await expect(root).toHaveAttribute("data-screen", "dine");
  await page.getByRole("button", { name: "Eat here" }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");

  await buttonWithText(page, "Cheeseburger").click();
  const sheet = page.getByRole("dialog", { name: "Cheeseburger" });
  await expect(sheet.getByText("Make it a set?")).toBeVisible();
  await buttonWithText(sheet, "Set").click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await buttonWithText(sheet, "Zero cola").click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("dialog", { name: "Would you like a dessert too?" }).getByRole("button", { name: "No, thanks" }).click();

  await page.getByRole("button", { name: "Order", exact: true }).click();
  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();
  await expect(page.getByText("Cheeseburger set", { exact: true })).toBeVisible();
  await expect(page.getByText("Fries (M) · Zero cola", { exact: true })).toBeVisible();
  await expect(page.getByText("₩6,900", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay" })).toBeVisible();
});
