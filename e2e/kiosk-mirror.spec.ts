import { expect, test } from "@playwright/test";
import { buttonWithText, claim, command, kioskRoot, readClaim } from "./helpers";

// The kiosk as a mirror (docs/UX.md Flow A): a phone claims the QR and changes the session; the kiosk follows
// the stream. Phone calls are plain HTTP with the device token.

test.use({ viewport: { width: 1080, height: 1920 } });

test("phone changes appear on the kiosk, and a second claim is refused", async ({ page, request }) => {
  await page.goto("/kiosk?k=malo");
  const root = kioskRoot(page);
  const { sessionId, claimToken } = await readClaim(page);

  const claimed = await claim(request, sessionId, claimToken);
  expect(claimed.status()).toBe(200);
  const { deviceToken } = await claimed.json();
  await expect(root).toHaveAttribute("data-screen", "dine");

  const phone = (type: string, args: object, extra: { source: string; cartVersion?: number; utteranceSeq?: number }) =>
    command(request, deviceToken, { sessionId, type, args, ...extra });

  await phone(
    "addToCart",
    { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"] } },
    { source: "voice", utteranceSeq: 1 },
  );
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(page.getByText(/^AI가 담았어요/)).toBeVisible();
  await expect(buttonWithText(page, "치즈버거")).toHaveClass(/k-ring/);

  await phone("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 2 });
  const checkout = await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await expect(root).toHaveAttribute("data-screen", "review");

  await phone("confirmCheckout", {}, { source: "button", cartVersion: checkout.cartVersion });
  await expect(root).toHaveAttribute("data-screen", "payment");

  const second = await claim(request, sessionId, claimToken);
  expect(second.status()).toBe(409);
  const body = await second.json();
  expect(body.error.code).toBe("CONFLICT");
  expect(body.error.message).toBe("Someone else is using this kiosk.");
});
