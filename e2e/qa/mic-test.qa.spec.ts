import { expect, test } from "@playwright/test";
import { qaState, type Findings, type Profile } from "./checks";

// UI QA of /mic-test (development page for real phones) at the four phone sizes, judged by the phone numbers.
// The project's fake microphone (playwright.qa.config.ts) lets the tested state be reached without a person.

const MIC_TEST: Profile = { route: "/mic-test", root: "body", minFont: 16, minTarget: 56 };

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  { width: 320, height: 700 },
];

const STRICT = process.env.QA_ALL === "1";

test.use({ viewport: VIEWPORTS[0], locale: "en-US" });

function judge(f: Findings, where: string) {
  expect.soft(f.h, `${where}: H failures`).toEqual([]);
  if (STRICT) expect.soft(f.t, `${where}: T misses`).toEqual([]);
}

test("mic-test: before and after the tests", async ({ page }, info) => {
  await page.goto("/mic-test");
  await expect(page.getByTestId("browser")).toBeVisible({ timeout: 60_000 });
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.evaluate(() => scrollTo(0, 0));
    judge(await qaState(page, info, MIC_TEST, "start", { reflow: true }), `/mic-test start ${vp.width}x${vp.height}`);
  }

  await page.setViewportSize(VIEWPORTS[0]);
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(page.getByText("Microphone works.")).toBeVisible();
  await page.getByRole("button", { name: "Test speaker" }).click();
  await expect(page.getByTestId("result-line")).toContainText("tone played", { timeout: 10_000 });
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.getByTestId("result-line").scrollIntoViewIfNeeded();
    judge(await qaState(page, info, MIC_TEST, "tested", { reflow: true }), `/mic-test tested ${vp.width}x${vp.height}`);
  }
});
