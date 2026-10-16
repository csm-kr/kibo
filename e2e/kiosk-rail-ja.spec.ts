import { expect, test, type Locator, type Page } from "@playwright/test";
import { buttonWithText, claim, command, kioskRoot, readClaim } from "./helpers";

// The airport rail ticket machine's third screen language, 日本語 (docs/UX.md "Language"): K1's language row offers
// 한국어, English and 日本語, and the choice holds for the order. The kiosk screens are Japanese from K1 to the reference
// number; the server, the AI and the phone keep Korean and English (docs/ARCHITECTURE.md "Kiosk data"), so an AI order
// lands in the Japanese cart with KIBO's English line under the AI banner. 1080x1920 canvas.

test.use({
  viewport: { width: 1080, height: 1920 },
  // Its own address for the dev server's per-IP limits (docs/RULE.md R-005).
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.200" },
});

const HANGUL = /[가-힣]/;

/** No Korean left on the screen (the K1 language row, which names 한국어, is checked on its own). */
async function expectNoKorean(root: Locator, where: string) {
  expect(HANGUL.test(await root.innerText()), `${where}: Korean on the Japanese screen`).toBe(false);
}

/**
 * K1: the three language buttons side by side in one row inside the canvas's 48px margins, each 72px tall and 8px
 * apart (canvas px; /demo scales the canvas).
 */
async function expectThreeLanguages(page: Page) {
  const group = kioskRoot(page).getByRole("group", { name: "언어" });
  const buttons = group.getByRole("button");
  await expect(buttons).toHaveText(["한국어", "English", "日本語"]);
  const canvas = (await page.locator("[data-kiosk-canvas]").boundingBox())!;
  const px = canvas.width / 1080;
  const boxes = await Promise.all([0, 1, 2].map(async (i) => (await buttons.nth(i).boundingBox())!));
  for (const b of boxes) {
    expect(b.height / px).toBeGreaterThanOrEqual(72 - 0.5);
    expect((b.x - canvas.x) / px).toBeGreaterThanOrEqual(48 - 0.5);
    expect((b.x + b.width - canvas.x) / px).toBeLessThanOrEqual(1080 - 48 + 0.5);
  }
  expect(new Set(boxes.map((b) => Math.round(b.y / px))).size).toBe(1);
  for (let i = 1; i < 3; i++) expect((boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width)) / px).toBeGreaterThanOrEqual(8 - 0.5);
}

test("airport rail in 日本語: K1 to the reference number, all in Japanese", async ({ page }) => {
  await page.goto("/kiosk?k=airport_rail");
  const root = kioskRoot(page);
  await readClaim(page);
  // The kiosk starts in its default language and offers three.
  await expect(page.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");
  await expectThreeLanguages(page);
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveAttribute("lang", "ja");

  // K1
  await expect(root.getByRole("heading", { name: "都心への最速ルート" })).toBeVisible();
  await expect(root.getByRole("heading", { name: "スマホで話して購入 (QR)" })).toBeVisible();
  await expect(root.getByText("スマホのカメラで読み取り")).toBeVisible();
  await expect(root.getByText("接続番号")).toBeVisible();
  await expect(root.getByRole("button", { name: "大きな文字・低い画面" })).toBeVisible();
  await expect(root.getByText("10,500ウォン")).toBeVisible();

  // K3: straight to the tickets (no dine question).
  await page.getByRole("button", { name: /画面をタッチして購入/ }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(root.getByRole("navigation", { name: "乗車券の種類" })).toBeVisible();
  await expect(root.getByRole("button", { name: "直通列車", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(buttonWithText(root, "直通列車 シティセンター")).toContainText("10,500ウォン");
  await expect(root.getByText("0枚選択")).toBeVisible();
  await expect(root.getByText("乗車券を選んでください")).toBeVisible();
  await expectNoKorean(root, "K3");

  // K4: passenger, then seat with the ticket count.
  await buttonWithText(root, "直通列車 シティセンター").click();
  const express = page.getByRole("dialog", { name: "直通列車 シティセンター" });
  await expect(express.getByText("ステップ 1/2 · お客さま")).toBeVisible();
  await expect(buttonWithText(express, "大人")).toHaveAttribute("aria-pressed", "true");
  await expect(express.getByText("1つ選んでください")).toBeVisible();
  await buttonWithText(express, "こども (6〜12歳)").click();
  await expect(buttonWithText(express, "こども (6〜12歳)")).toContainText("5,250ウォン");
  await expectNoKorean(express, "K4 passenger");
  await express.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(express.getByText("ステップ 2/2 · 座席")).toBeVisible();
  await expect(express.getByText("選ばなくてもかまいません")).toBeVisible();
  await buttonWithText(express, "窓側").click();
  await expect(express.getByText("枚数", { exact: true })).toBeVisible();
  await express.getByRole("button", { name: "選択", exact: true }).click();
  await expect(express).toBeHidden();
  await expect(root.getByText("1枚選択")).toBeVisible();

  // A pass: one step, the ticket count.
  await root.getByRole("button", { name: "カード・パス", exact: true }).click();
  await buttonWithText(root, "1日乗車券").click();
  const pass = page.getByRole("dialog", { name: "1日乗車券" });
  await expect(pass.getByText("ステップ 1/1 · 枚数")).toBeVisible();
  await pass.getByRole("button", { name: "1つ増やす" }).click();
  await pass.getByRole("button", { name: "選択", exact: true }).click();
  await expect(pass).toBeHidden();
  await expect(root.getByText("3枚選択")).toBeVisible();

  // K6: the child express with a window seat 5,250 + two day passes 2 x 15,000 (data/kiosks/airport_rail.json).
  const checkout = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "requestCheckout",
  );
  await root.getByRole("button", { name: "購入する", exact: true }).click();
  expect((await (await checkout).json()).total).toBe(35250);
  await expect(root).toHaveAttribute("data-screen", "review");
  await expect(root.getByRole("heading", { name: "購入内容をご確認ください" })).toBeVisible();
  await expect(root.locator("ul > li")).toHaveCount(2);
  await expect(root.getByText("こども (6〜12歳) · 窓側", { exact: true })).toBeVisible();
  await expect(root.getByText("合計金額")).toBeVisible();
  await expect(root.getByText("35,250ウォン", { exact: true })).toBeVisible();
  await expect(root.getByRole("button", { name: "乗車券を追加する" })).toBeVisible();
  await expectNoKorean(root, "K6");

  // K7: payment method, then the card.
  await root.getByRole("button", { name: "お支払い", exact: true }).click();
  await expect(root.getByRole("heading", { name: "お支払い方法を選んでください" })).toBeVisible();
  await expect(root.getByRole("button", { name: /電子決済/ })).toBeDisabled();
  await expect(root.getByText("非対応", { exact: true })).toHaveCount(2);
  await root.getByRole("button", { name: "カード", exact: true }).click();
  await expect(root.getByRole("heading", { name: "カードを下の挿入口に入れてください" })).toBeVisible();
  await expect(root.getByText("体験用のお支払いです。実際には請求されません。")).toBeVisible();
  await expect(root.getByRole("button", { name: "乗車券を変更" })).toBeVisible();
  await expectNoKorean(root, "K7");

  // K8: receipt question, then the reference number with what was bought.
  await root.getByRole("button", { name: "カードを入れる" }).click();
  await expect(root).toHaveAttribute("data-screen", "done");
  await expect(root.getByRole("heading", { name: "領収書を発行しますか？" })).toBeVisible();
  await expect(root.getByRole("timer")).toContainText("秒後に受付番号を表示します");
  await expectNoKorean(root, "K8 receipt");
  await root.getByRole("button", { name: "発行しない" }).click();
  await expect(root.getByRole("heading", { name: "受付番号" })).toBeVisible();
  await expect(root.getByText("乗車券をお取りください")).toBeVisible();
  await expect(root.getByRole("heading", { name: "購入内容" })).toBeVisible();
  await expect(root.getByRole("timer")).toContainText("秒後に最初の画面に戻ります");
  await expectNoKorean(root, "K8 reference number");
});

test("an AI order on the Japanese screen: KIBO working, then the ticket in the cart with KIBO's English line", async ({ page, request }) => {
  await page.goto("/kiosk?k=airport_rail");
  const root = kioskRoot(page);
  const { sessionId, claimToken } = await readClaim(page);
  // Someone picks 日本語 on K1, then scans the QR: the choice holds for this order.
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(root.getByRole("heading", { name: "都心への最速ルート" })).toBeVisible();
  const claimed = await claim(request, sessionId, claimToken);
  expect(claimed.status()).toBe(200);
  const { deviceToken } = await claimed.json();
  // A ticket machine has no dine question: the menu, in Japanese, with the phone connected.
  await expect(root).toHaveAttribute("data-screen", "menu");
  await expect(root).toHaveAttribute("lang", "ja");
  await expect(root.getByText("スマホ接続中")).toBeVisible();

  // The phone sent a message to the AI: KIBO's own line, in the screen's language and in English.
  const ping = await request.post("/api/ping", {
    data: { sessionId, active: true, working: true },
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  expect(ping.status()).toBe(200);
  await expect(root.locator("[data-kibo-working]")).toHaveText("KIBO処理しています · Working…");

  // What the AI sends for "One adult express to City Center, window seat".
  let seq = 0;
  const ai = (type: string, args: object = {}) => command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq });
  await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 1, selections: { passenger: ["adult"], seat: ["window"] } });
  await expect(buttonWithText(root, "直通列車 シティセンター")).toHaveClass(/k-ring/);
  // The kiosk's own banner in Japanese, and KIBO's English line under it (the screen is not English).
  await expect(root.getByText("AIが選びました: 直通列車 シティセンター")).toBeVisible();
  const subtitle = root.locator("[data-kiosk-subtitle]");
  await expect(subtitle).toHaveText(/^KIBO\s*AI chose: Express to City Center · Adult · Window$/);
  await expect(subtitle).toHaveAttribute("lang", "en");
  await expect(root.getByText("1枚選択")).toBeVisible();
  const chips = root.getByRole("region", { name: "選択した乗車券" }).locator("li");
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveText(/直通列車 シティセンター ×1\s*10,500ウォン/);

  // "That's all": the review in Japanese; only the person's tap on the phone confirms, then the kiosk takes the card.
  const checkout = await ai("requestCheckout");
  await expect(root.getByRole("heading", { name: "購入内容をご確認ください" })).toBeVisible();
  await command(request, deviceToken, { sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: checkout.cartVersion });
  await expect(root.getByRole("heading", { name: "お支払い方法を選んでください" })).toBeVisible();
  await root.getByRole("button", { name: "カード", exact: true }).click();
  await root.getByRole("button", { name: "カードを入れる" }).click();
  await root.getByRole("button", { name: "発行しない" }).click();
  await expect(root.getByRole("heading", { name: "受付番号" })).toBeVisible();
});

test("ko and en keep their own screens: the language row switches back, and a new order starts in Korean", async ({ page }) => {
  await page.goto("/kiosk?k=airport_rail");
  const root = kioskRoot(page);
  await readClaim(page);
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(root.getByRole("heading", { name: "都心への最速ルート" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(root.getByRole("heading", { name: "The fastest way downtown" })).toBeVisible();
  await expect(root).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "한국어" }).click();
  await expect(root.getByRole("heading", { name: "도심까지 가장 빠른 길" })).toBeVisible();
  await expect(root).toHaveAttribute("lang", "ko");

  // A new session (the next customer) starts in the kiosk's default language.
  await page.getByRole("button", { name: "日本語" }).click();
  await page.getByRole("button", { name: /画面をタッチして購入/ }).click();
  await expect(root).toHaveAttribute("data-screen", "menu");
  await root.getByRole("button", { name: "最初に戻る", exact: true }).click();
  await expect(root).toHaveAttribute("data-screen", "attract");
  await expect(page.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");
  await expect(root.getByRole("heading", { name: "도심까지 가장 빠른 길" })).toBeVisible();
});

test.describe("/demo", () => {
  test.use({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.201" } });

  test("[Start] on the airport rail: 日本語 on K1, then the judge's phone orders; the caption row's step stays English", async ({
    page,
    request,
  }) => {
    await page.goto("/demo?k=airport_rail");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("main[data-demo-own-phone]")).toBeVisible();
    const root = kioskRoot(page);
    const step = page.locator("[data-kiosk-step]");
    const { sessionId, claimToken } = await readClaim(page);
    await expectThreeLanguages(page);
    await root.getByRole("button", { name: "日本語" }).click();
    await expect(root.getByRole("heading", { name: "都心への最速ルート" })).toBeVisible();
    await expect(step).toHaveText("Start: scan the QR with your phone's camera.");

    const { deviceToken } = await (await claim(request, sessionId, claimToken)).json();
    let seq = 0;
    const ai = (type: string, args: object = {}) =>
      command(request, deviceToken, { sessionId, type, args, source: "voice", utteranceSeq: ++seq });
    await ai("addToCart", { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } });
    await expect(root).toHaveAttribute("lang", "ja");
    await expect(root.locator("[data-kiosk-subtitle]")).toHaveText(/^KIBO\s*AI chose: Express to City Center · Adult$/);
    await expect(root.getByText("21,000ウォン").first()).toBeVisible();
    await expect(step).toHaveText("Tickets: yours show at the bottom.");

    const checkout = await ai("requestCheckout");
    await expect(root.getByRole("heading", { name: "購入内容をご確認ください" })).toBeVisible();
    await expect(step).toHaveText("Ticket review: nothing is paid until you confirm.");
    await command(request, deviceToken, { sessionId, type: "confirmCheckout", args: {}, source: "button", cartVersion: checkout.cartVersion });
    await expect(root.getByRole("heading", { name: "お支払い方法を選んでください" })).toBeVisible();
    // KIBO's step line stays English (it names the Korean kiosk's own labels, docs/ISSUE.md).
    await expect(step).toHaveText(/^Payment: tap /);
    expect(await step.innerText()).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
    await root.getByRole("button", { name: "カード", exact: true }).click();
    await root.getByRole("button", { name: "カードを入れる" }).click();
    await root.getByRole("button", { name: "発行しない" }).click();
    await expect(root.getByRole("heading", { name: "受付番号" })).toBeVisible();
    await expect(step).toHaveText("Reference number: done, no money was charged.");
  });
});
