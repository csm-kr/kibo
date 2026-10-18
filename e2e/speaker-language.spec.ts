import { expect, test } from "@playwright/test";
import { warmPhone } from "./helpers";

// The phone's screens follow the language the user types or speaks (owner 10-18, I-404): an English order on a
// Korean iPhone left the review and "insert your card" in Korean. No model: /api/chat is answered by the test, and the
// switch happens when the user's own line is sent, before any reply.

// Its own address for the dev server's per-IP limits (R-005).
test.use({
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.61" },
  viewport: { width: 390, height: 844 },
  locale: "ko-KR",
});

test.beforeAll(async ({ browser, request }) => {
  await warmPhone(browser, request);
});

test("a Korean phone switches its screens to English after a typed English order, and back after a Korean one", async ({ page, request }) => {
  const res = await request.post("/api/session", { data: { kioskId: "malo" } });
  const created = (await res.json()) as { sessionId: string; claimUrl: string };
  await page.goto(created.claimUrl);
  await page.getByRole("button", { name: "글자로 입력할게요" }).click();
  await page.getByRole("button", { name: "매장에서 먹기" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "talk");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");

  const bodies: { message: string; locale: string; language?: string }[] = [];
  await page.route("**/api/chat", async (route) => {
    bodies.push(route.request().postDataJSON());
    const reply = bodies.length === 1 ? "Which drink would you like with it?" : "음료는 무엇으로 드릴까요?";
    await route.fulfill({ json: { ok: true, reply, status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } });
  });

  await page.getByRole("textbox", { name: "주문을 글자로 입력" }).fill("Bulgogi burger set please");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Language and text size: English" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your order" })).toBeVisible();
  await expect(page.getByText("Which drink would you like with it?")).toBeVisible();
  // Remembered like a picker choice.
  expect(await page.evaluate(() => localStorage.getItem("kibo.phone.locale"))).toBe("en");

  await page.getByRole("textbox", { name: "Type your order" }).fill("불고기버거 세트 주세요");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("button", { name: "언어와 글씨 크기: 한국어" })).toBeVisible();
  await expect(page.getByText("음료는 무엇으로 드릴까요?")).toBeVisible();

  // Each line went to the AI with the screens it was typed on; the next one carries the language it switched to.
  expect(bodies.map((b) => [b.message, b.locale])).toEqual([
    ["Bulgogi burger set please", "ko"],
    ["불고기버거 세트 주세요", "en"],
  ]);

  // A short line is no evidence: "cola" keeps the Korean screens.
  await page.getByRole("textbox", { name: "주문을 글자로 입력" }).fill("cola");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => bodies.length).toBe(3);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});
