import { expect, test } from "@playwright/test";

// /learn and /learn/<runId>: replays of recorded KIBO Learn runs (public/learn/, `npm run learn:runs`). No API calls
// beyond page loads; its own address anyway (R-005).

test.use({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.40" },
});

test("/learn lists the recorded runs with their numbers", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Watch KIBO learn a kiosk from its screens alone." })).toBeVisible({ timeout: 60_000 });
  const cards = page.locator("[data-learn-run]");
  await expect(cards).toHaveCount(3);
  // The fresh hold-out kiosk comes first, with its wrong-total caveat next to the order numbers (I-197).
  const fresh = cards.first();
  await expect(fresh).toHaveAttribute("data-learn-run", "themepark");
  await expect(fresh).toContainText("never seen before this run");
  await expect(fresh).toContainText("10 correct, 0 refused, 0 unsafe, of 10");
  await expect(fresh).toContainText("In 4 of them the skill's own total was wrong");
  await expect(fresh).toContainText("spikes/blind-kiosks/results/bk6-themepark/final/grade-v2.json");
  const blind = page.locator('[data-learn-run="airport-shop"]');
  await expect(blind).toContainText("37 of 37 items found");
  await expect(blind).toContainText("10 correct, 0 refused, 0 unsafe, of 10");
  await expect(blind).toContainText("spikes/blind-kiosks/results/bk4-airport-shop/final/grade-v2.json");
  const dough = page.locator('[data-learn-run="doughhouse"]');
  await expect(dough).toContainText("4 correct, 0 refused, 0 unsafe, of 4");
  // Its trace predates the restyle, and the card says so (14-final:3).
  await expect(dough).toContainText("Recorded on 10-13, before the kiosk's look was restyled");
  // The files behind the numbers sit in one footnote per card, not in the body.
  await expect(fresh.locator("[data-learn-sources]")).toHaveCount(1);
  // How the bridge gets onto a real kiosk, without claiming partners.
  const real = page.locator("[data-learn-real]");
  await expect(real).toContainText("one script tag");
  await expect(real).toContainText("no kiosk vendor partnerships yet");
  await blind.getByRole("link", { name: "Watch this run" }).click();
  await expect(page).toHaveURL(/\/learn\/airport-shop$/);
});

test("the viewer steps through the trace, reaches the finish and hides the order button for a test-only kiosk", async ({ page }) => {
  await page.goto("/learn/airport-shop");
  const turn = page.locator("[data-learn-turn]");
  await expect(turn).toHaveText(/Turn 1 of 64/, { timeout: 60_000 });
  await expect(page.locator("[data-learn-action]")).toHaveText("Tapped 화면을 터치하여 주문을 시작하세요");
  await page.locator("[data-learn-next]").click();
  await expect(turn).toHaveText(/Turn 2 of 64/);
  await expect(page.getByRole("img", { name: "The kiosk screen after turn 2" })).toHaveAttribute("src", "/learn/airport-shop/turn-2.webp");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(turn).toHaveText(/Turn 1 of 64/);

  // A milestone jumps to its turn; the counters are the trace's own.
  await page.locator('[data-learn-milestone="first-item"]').click();
  await expect(turn).toHaveText(/Turn 19 of 64/);
  await expect(page.locator('[data-learn-count="Items"]')).toHaveText("7");
  await expect(page.locator("[data-learn-skill]")).toHaveCount(0);

  await page.locator('[data-learn-milestone="finish"]').click();
  await expect(turn).toHaveText(/Turn 64 of 64/);
  await expect(page.locator("[data-learn-action]")).toHaveText("Asked to finish: accepted");
  await expect(page.locator('[data-learn-count="Items"]')).toHaveText("37");
  const skill = page.locator("[data-learn-skill]");
  await expect(skill).toBeVisible();
  await expect(skill.getByRole("rowheader", { name: "야채김밥" })).toBeVisible();
  await expect(skill.locator("[data-learn-order]")).toHaveCount(0);
  await expect(skill.locator("[data-learn-no-order]")).toContainText("not in the live demo");
});

test("the theme park replay says it kept no notes and ends at its learned skill without an order button", async ({ page }) => {
  await page.goto("/learn/themepark");
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 87/, { timeout: 60_000 });
  await expect(page.locator("[data-learn-no-notes]")).toBeVisible();
  await expect(page.locator("[data-learn-count]")).toHaveCount(0);
  await page.locator('[data-learn-milestone="finish"]').click();
  const skill = page.locator("[data-learn-skill]");
  await expect(skill.getByRole("rowheader", { name: "종일 자유이용권" })).toBeVisible();
  await expect(skill.locator("[data-learn-order]")).toHaveCount(0);
  await expect(skill.locator("[data-learn-no-order]")).toContainText("not in the live demo");
});

test("play advances by itself; the Doughhouse replay ends with an order button to its live demo", async ({ page }) => {
  await page.goto("/learn/doughhouse");
  const turn = page.locator("[data-learn-turn]");
  await expect(turn).toHaveText(/Turn 1 of 38/, { timeout: 60_000 });
  await expect(page.locator("[data-learn-action]")).toHaveText("Refused to tap 주문하기: it is a payment or checkout button");
  await page.getByRole("button", { name: "16×" }).click();
  await page.locator("[data-learn-play]").click();
  await expect(turn).toHaveText(/Turn 38 of 38/, { timeout: 15_000 });
  await expect(page.locator("[data-learn-play]")).toHaveText("Play again");
  const order = page.locator("[data-learn-order]");
  await expect(order).toHaveAttribute("href", "/demo?k=doughhouse");
  await order.click();
  await expect(page).toHaveURL(/\/demo\?k=doughhouse$/);
  await expect(page.getByRole("link", { name: "How KIBO learned the pizza kiosk" })).toHaveAttribute("href", "/learn/doughhouse");
});

test("on a phone the action and [Play] are on the first screen; the picture can be shown larger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learn/airport-shop");
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 64/, { timeout: 60_000 });
  await expect(page.locator("[data-learn-action]")).toBeInViewport({ ratio: 1 });
  await expect(page.locator("[data-learn-play]")).toBeInViewport({ ratio: 1 });

  await page.setViewportSize({ width: 1440, height: 900 });
  const shot = page.getByRole("img", { name: "The kiosk screen after turn 1" });
  const small = (await shot.boundingBox())!.width;
  await page.locator("[data-learn-zoom]").click();
  await expect(page.locator("[data-learn-zoom]")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await shot.boundingBox())!.width).toBeGreaterThan(small * 1.4);
});

test("with reduced motion the replay never plays by itself", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learn/doughhouse");
  await expect(page.locator("[data-learn-turn]")).toHaveText(/Turn 1 of 38/, { timeout: 60_000 });
  await expect(page.locator("[data-learn-play]")).toBeDisabled();
  await expect(page.getByText("Step with Back and Next.")).toBeVisible();
});

test("the landing page links to /learn", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Watch KIBO learn a new kiosk" })).toHaveAttribute("href", "/learn", { timeout: 60_000 });
});
