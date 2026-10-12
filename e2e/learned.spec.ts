import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { claim, command, readClaim, storedKioskSession } from "./helpers";

// KIBO Learn at runtime (docs/ARCHITECTURE.md sequence 3): the phone's commands wait for the bridge on
// /learned/doughhouse, which replays them on the unchanged kiosk page in its iframe and reports the kiosk's total.
// Memory store, no model. Prices are from skills/doughhouse.json.

const PEPPERONI = 17900 + 4000 + 0 + 1500 + 800; // large, thin, bacon, olive = 24,200
const COLA_LARGE = 2000 + 1300; // 1.25L = 3,300
const GARLIC_DIP = 500;

test.use({
  viewport: { width: 1440, height: 900 },
  // Its own address for the dev server's per-IP limit (60 a minute), which the other specs already use up (I-068).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.20" },
});

test("phone orders replay on the learned pizza kiosk, and a mismatch calls staff", async ({ page, request }) => {
  await page.goto("/learned/doughhouse");
  const { sessionId, claimToken } = await readClaim(page);
  const claimed = await claim(request, sessionId, claimToken);
  expect(claimed.status()).toBe(200);
  const { deviceToken } = await claimed.json();
  const { kioskToken } = await storedKioskSession(page, "doughhouse");

  const widget = page.locator("[data-learned-widget]");
  const kioskPage = page.frameLocator("iframe[data-learned-kiosk]");
  const timings: { command: string; replayMs: number; endToEndMs: number; ok: boolean }[] = [];
  let seq = 0;

  /** Sends one phone command, then waits until the bridge has replayed it and its report was accepted. */
  async function phone(label: string, type: string, args: object) {
    const commandId = randomUUID();
    const started = Date.now();
    const res = await request.post("/api/command", {
      headers: { Authorization: `Bearer ${deviceToken}` },
      data: { sessionId, commandId, type, args, source: "voice", utteranceSeq: ++seq },
    });
    const json = await res.json();
    expect(json.ok, `${type}: ${JSON.stringify(json.error)}`).toBe(true);
    expect(json.result?.pending).toBe(true);
    await expect(widget).toHaveAttribute("data-replay-command", commandId, { timeout: 15_000 });
    const endToEndMs = Date.now() - started;
    const ok = (await widget.getAttribute("data-replay-ok")) === "true";
    timings.push({ command: label, replayMs: Number(await widget.getAttribute("data-replay-ms")), endToEndMs, ok });
  }

  /** The session as the server holds it (startTouch changes nothing once ordering). */
  const sessionNow = () => command(request, kioskToken, { sessionId, type: "startTouch", source: "touch" });
  const kioskTotal = kioskPage.locator("#cartTotal");
  const kioskLines = kioskPage.locator("#cartList li");

  await phone("setDineOption eat_in", "setDineOption", { option: "eat_in" });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await expect(kioskPage.getByText("피자", { exact: true })).toBeVisible();

  await phone("addToCart pepperoni large thin bacon olive", "addToCart", {
    itemId: "pepperoni",
    qty: 1,
    selections: { size: ["large"], dough: ["thin"], toppings: ["bacon", "olive"] },
  });
  await phone("addToCart cola 1.25L", "addToCart", { itemId: "cola", qty: 1, selections: { volume: ["l_1_25"] } });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await expect(kioskLines).toHaveCount(2);
  await expect(kioskLines.nth(0)).toContainText("페퍼로니 (라지, 씬, 베이컨, 올리브) x1");
  await expect(kioskLines.nth(1)).toContainText("콜라 (1.25L) x1");
  await expect(kioskTotal).toHaveText((PEPPERONI + COLA_LARGE).toLocaleString("en-US"));
  // The kiosk's own upsell popup was closed by the recipe.
  await expect(kioskPage.getByText("아니요, 괜찮아요")).toBeHidden();

  const afterAdds = await sessionNow();
  expect(afterAdds.total).toBe(PEPPERONI + COLA_LARGE);
  const cart = afterAdds.cart as { lineId: string; itemId: string }[];
  expect(cart.map((l) => l.itemId)).toEqual(["pepperoni", "cola"]);

  await phone("removeFromCart cola", "removeFromCart", { lineId: cart[1].lineId });
  await expect(widget).toHaveAttribute("data-bridge-ok", "true");
  await expect(kioskLines).toHaveCount(1);
  await expect(kioskTotal).toHaveText(PEPPERONI.toLocaleString("en-US"));
  expect((await sessionNow()).total).toBe(PEPPERONI);

  // Someone deletes the pizza on the kiosk itself; the next replay finds a cart that differs from the session.
  await kioskPage.getByRole("button", { name: "삭제" }).click();
  await expect(kioskLines).toHaveCount(0);
  await phone("addToCart garlic dip (kiosk cart edited by hand)", "addToCart", { itemId: "garlic_dip", qty: 1 });
  expect(timings.at(-1)?.ok).toBe(false);
  await expect(widget).toHaveAttribute("data-bridge-ok", "false");
  await expect(widget).toHaveAttribute("data-staff-called", "learned_mismatch");
  await expect(widget).toContainText("Please check the screen");
  await expect(kioskTotal).toHaveText(GARLIC_DIP.toLocaleString("en-US"));
  // Nothing was applied: the session keeps its last verified cart.
  expect((await sessionNow()).total).toBe(PEPPERONI);

  expect(timings.slice(0, -1).every((t) => t.ok)).toBe(true);

  // Evidence for docs/TESTING.md (R-001). An automated run on a laptop against the dev server.
  mkdirSync("evidence", { recursive: true });
  writeFileSync(
    "evidence/bridge-replay.json",
    `${JSON.stringify(
      {
        date: new Date().toISOString(),
        kiosk: "doughhouse",
        note: "automated Playwright run (e2e/learned.spec.ts) on a laptop, dev server, memory store, no AI. replayMs: bridge replay and check of the kiosk page, before the report. endToEndMs: phone command sent until the bridge's report was accepted",
        commands: timings,
      },
      null,
      2,
    )}\n`,
  );
});
