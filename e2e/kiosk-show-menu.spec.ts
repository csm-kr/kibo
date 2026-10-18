import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { claim, command, kioskRoot, readClaim } from "./helpers";

// QA 10-18: "키오스크 메뉴 보여줘" on the phone left the kiosk on 매장/포장, since only a cart change moved its screen.
// The AI's showMenu (the same command a Live or text tool call sends) moves it.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.48" },
});

test("the phone's showMenu moves the kiosk from 매장/포장 to the asked category and on; the dine option is asked at checkout", async ({
  page,
  request,
}) => {
  await page.goto("/kiosk?k=malo");
  const { sessionId, claimToken } = await readClaim(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  const root = kioskRoot(page);
  await expect(root).toHaveAttribute("data-screen", "dine");

  let seq = 0;
  const phone = (type: string, args: object = {}) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  const category = (name: string) => page.getByRole("navigation").getByRole("button", { name, exact: true });

  await phone("showMenu", { category: "drink" });
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(category("음료")).toHaveAttribute("aria-current", "true");

  await phone("showMenu", { category: "dessert" });
  await expect(category("디저트")).toHaveAttribute("aria-current", "true");
  await expect(category("음료")).not.toHaveAttribute("aria-current", "true");

  // The order goes on as before: an add moves the rail to its item, and checkout asks eat here or take out.
  await phone("addToCart", { itemId: "cola" });
  await expect(category("음료")).toHaveAttribute("aria-current", "true");
  const checkout = await request.post("/api/command", {
    headers: { Authorization: `Bearer ${deviceToken}` },
    data: { sessionId, commandId: randomUUID(), type: "requestCheckout", args: {}, source: "voice", utteranceSeq: ++seq },
  });
  expect((await checkout.json()).error?.code).toBe("NEEDS_CHOICE");
});
