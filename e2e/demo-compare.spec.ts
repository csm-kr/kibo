import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { command, kioskRoot } from "./helpers";

// /demo D3 "touch vs talk" card. No model calls: /api/chat is answered by the test, which applies the hero order
// through the API with the demo's device token, as the real route would. The touch column must show the evidence file
// the card was built with (src/lib/demo/evidence.ts).

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.37" },
});

const card = (page: Page) => page.locator("[data-compare-card]");
const value = (page: Page, name: string) => card(page).locator(`[data-compare="${name}"]`);

test("the hero order by text: this session's counts next to the efficient touch run", async ({ page, request }) => {
  const evidence = JSON.parse(readFileSync("evidence/touch-hero-efficient.json", "utf8")) as { taps: number; date: string };
  const editPath = JSON.parse(readFileSync("evidence/touch-hero.json", "utf8")) as { taps: number };

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const s = (await (await created).json()) as { sessionId: string; deviceToken: string };

  // Tap 1: the dine option on the phone.
  await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
  await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");

  let seq = 0;
  await page.route("**/api/chat", async (route) => {
    seq += 1;
    const ai = (type: string, args: object) =>
      command(request, s.deviceToken, { sessionId: s.sessionId, type, args, source: "text", utteranceSeq: seq });
    if (seq === 1) {
      await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["zero_cola"], ingredients: ["no_pickles"] } });
      await ai("addToCart", { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["cider"] } });
    } else {
      await ai("requestCheckout", {});
    }
    await route.fulfill({ json: { ok: true, reply: "Done.", status: "ordering", cart: [], total: 0, cartVersion: 0, actions: [] } });
  });

  // Taps 2 and 3: two typed messages and their [Send].
  const input = page.getByRole("textbox", { name: "Type your order" });
  await input.fill("Two cheeseburger sets with large fries, one zero cola without pickles, one cider");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("region", { name: "Your order" }).locator("li")).toHaveCount(2);
  await input.fill("I'll pay");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Please check your order" })).toBeVisible();

  // Tap 4: the confirm card. Then the card stand-in, under the kiosk: a kiosk tap (15-judge-fixes:2).
  await page.getByRole("button", { name: "Yes, pay now" }).click();
  await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "done");

  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading", { name: "This order with KIBO" })).toBeVisible();
  await expect(value(page, "sentences")).toHaveText("2");
  await expect(value(page, "phone-taps")).toHaveText("4");
  await expect(value(page, "kiosk-taps")).toHaveText("1");
  // No touch time to set it against (an automated run), so this order's seconds are not shown either (14-final:1).
  await expect(value(page, "seconds")).toHaveCount(0);
  await expect(card(page)).toContainText("Counted in this browser for this order");
  // The next steps sit right under the order number, in view without scrolling the phone column.
  await expect(page.getByRole("button", { name: "Try again" })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("navigation", { name: "Try another place" })).toBeInViewport({ ratio: 1 });

  // The same cart as the evidence run, so its taps are shown as the same order, labelled as automated.
  await expect(card(page).getByRole("heading", { name: "The same order by touch" })).toBeVisible();
  await expect(value(page, "touch-taps")).toHaveText(String(evidence.taps));
  await expect(card(page)).toContainText("Not shown: an automated run taps at machine speed.");
  await expect(card(page).locator("[data-compare-source]")).toContainText(
    `automated run on this kiosk simulator (${evidence.date.slice(0, 10)})`,
  );
  await expect(card(page).locator("[data-compare-source]")).toContainText(`${editPath.taps} taps`);
  await expect(card(page)).not.toContainText("Reference order:");

  // Counting stopped at `paid`: the kiosk's receipt answer adds nothing.
  await page.getByRole("button", { name: "출력 안 함" }).click();
  await expect(value(page, "kiosk-taps")).toHaveText("1");
});
