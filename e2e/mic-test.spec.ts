import { expect, test } from "@playwright/test";

// /mic-test with Chromium's fake microphone (a beeping tone) and auto-allowed permission prompt. The page must
// send nothing to the server: every request is a GET for the page and its assets, none to /api/.

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test("mic-test: the level meter moves, the speaker starts, the result line appears, nothing is sent", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (r.method() !== "GET" || pathname.startsWith("/api/")) sent.push(`${r.method()} ${pathname}`);
  });

  await page.goto("/mic-test");
  await expect(page.getByTestId("browser")).toHaveText(/Chrome/, { timeout: 60_000 });
  await expect(page.getByTestId("in-app")).toHaveText("No");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByTestId("result-line")).toHaveCount(0);

  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(page.getByText("Microphone works.")).toBeVisible();
  // The fake device beeps on and off, so the meter takes several values, some above zero.
  const meter = page.getByRole("meter", { name: "Microphone level" });
  const seen = new Set<number>();
  await expect
    .poll(
      async () => {
        seen.add(Number(await meter.getAttribute("aria-valuenow")));
        return [...seen].filter((v) => v > 0).length;
      },
      { timeout: 15_000, intervals: [50] },
    )
    .toBeGreaterThan(1);

  await page.getByRole("button", { name: "Test speaker" }).click();
  const line = page.getByTestId("result-line");
  await expect(line).toContainText("speaker: running after tap, tone played", { timeout: 10_000 });
  await expect(line).toContainText(/\| mic: ok \(\w+ -> \w+\), \d+ Hz/);
  await expect(line).toContainText("| in-app: no |");
  await expect(line).toContainText("reload: test, reload, test again");

  // The tab remembers the grant, so the test after a reload can say whether the browser kept it.
  await page.reload();
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(line).toContainText(/reload: (remembered|not remembered|unknown, did the browser ask again\?)$/);

  expect(sent).toEqual([]);
});

test("mic-test names an in-app browser", async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
  });
  const page = await ctx.newPage();
  await page.goto("/mic-test");
  await expect(page.getByTestId("in-app")).toHaveText("Yes, KakaoTalk", { timeout: 60_000 });
  await expect(page.getByTestId("browser")).toHaveText("iOS WebKit");
  await expect(page.getByText("In-app browsers often block the microphone.")).toBeVisible();
  await ctx.close();
});
