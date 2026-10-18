import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { claim, command, kioskRoot, readClaim } from "./helpers";

// Owner 10-18 (deck p9, I-418): "키오스크도 영어로 바꿔줘" on the phone switches the kiosk's own screen, when the kiosk
// has that language; a kiosk without it stays as it is. The AI's setKioskLanguage sends this same command.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.49" },
});

test("MALO: the asked language wins over an earlier K1 tap, a missing one is refused, and the menu follows", async ({
  page,
  request,
}) => {
  await page.goto("/kiosk?k=malo");
  const { sessionId, claimToken } = await readClaim(page);
  const root = kioskRoot(page);
  await expect(root).toHaveAttribute("lang", "ko");
  // A tap on K1's language row before the phone connects.
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(root).toHaveAttribute("lang", "en");

  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  await expect(root).toHaveAttribute("data-screen", "dine");
  await expect(root.getByRole("heading", { name: "Eat here or take out?" })).toBeVisible();

  let seq = 0;
  const phone = (type: string, args: object = {}) =>
    command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq });

  await phone("setKioskLanguage", { language: "ko" });
  await expect(root).toHaveAttribute("lang", "ko");
  await expect(root.getByRole("heading", { name: "매장에서 드시나요, 포장하시나요?" })).toBeVisible();

  await phone("setKioskLanguage", { language: "en" });
  await expect(root).toHaveAttribute("lang", "en");

  // MALO's screen has Korean and English only.
  const ja = await request.post("/api/command", {
    headers: { Authorization: `Bearer ${deviceToken}` },
    data: { sessionId, commandId: randomUUID(), type: "setKioskLanguage", args: { language: "ja" }, source: "voice", utteranceSeq: ++seq },
  });
  expect((await ja.json()).error?.code).toBe("BAD_REQUEST");
  await expect(root).toHaveAttribute("lang", "en");

  // The rest of the order goes on in the asked language.
  await phone("showMenu", { category: "drink" });
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Drinks", exact: true })).toHaveAttribute("aria-current", "true");
});

test("airport rail: the phone asks for 日本語 and the ticket machine shows it", async ({ page, request }) => {
  await page.goto("/kiosk?k=airport_rail");
  const { sessionId, claimToken } = await readClaim(page);
  const root = kioskRoot(page);
  const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(root).toHaveAttribute("lang", "ko");

  await command(request, deviceToken, { sessionId, type: "setKioskLanguage", args: { language: "ja" }, source: "text" });
  await expect(root).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("navigation").getByRole("button", { name: "直通列車", exact: true })).toBeVisible();
});
