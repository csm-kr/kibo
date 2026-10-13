// Self-check: places holdout orders h3, h5 and h10 by hand in the kiosk and prints the
// displayed totals (cart drawer, review screen, payment screen) against answer-key.json.
// Usage: node selfcheck/selfcheck.cjs
const path = require('path');
const { chromium } = require('/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'app', 'index.html');
const KEY = require(path.join(ROOT, 'answer-key.json'));
const SHOTS = path.join(__dirname, 'shots');

const won = (s) => Number(String(s).replace(/[^0-9]/g, ''));

async function start(page, langButton) {
  await page.goto(APP);
  await page.getByRole('button', { name: langButton, exact: true }).click();
  await page.locator('.att-touch').click();
}
const category = (page, label) => page.locator('.cat', { hasText: label }).click();
const tile = (page, name) => page.locator('.tile').filter({ has: page.locator('.t-name', { hasText: name }) });

async function addSimple(page, name, qty, ageAnswer) {
  const t = tile(page, name);
  await t.locator('button', { hasText: /담기|Add/ }).click();
  if (ageAnswer) await page.locator('.dialog button', { hasText: ageAnswer }).click();
  for (let i = 1; i < qty; i++) await t.locator('button', { hasText: '+' }).click();
}
async function addWithOptions(page, name, picks, { shots = 0, qty = 1 } = {}) {
  await tile(page, name).locator('button', { hasText: /옵션 선택|Options/ }).click();
  const sheet = page.locator('.sheet');
  for (const label of picks) await sheet.locator('.opt', { hasText: label }).click();
  for (let i = 0; i < shots; i++) await sheet.locator('.opt-q button', { hasText: '+' }).click();
  for (let i = 1; i < qty; i++) await sheet.locator('.sh-qty button', { hasText: '+' }).click();
  await sheet.locator('.sh-actions .btn-primary').click();
  await sheet.waitFor({ state: 'detached' });
}
async function checkout(page, id) {
  await page.locator('#fab').click();
  await page.waitForTimeout(400); // drawer slide-in
  const drawer = won(await page.locator('#drawerTotal').textContent());
  await page.screenshot({ path: path.join(SHOTS, id + '-drawer.png') });
  await page.locator('#drawer .btn-primary').click();
  await page.waitForTimeout(400); // drawer slide-out
  const review = won(await page.locator('#reviewTotal').textContent());
  await page.screenshot({ path: path.join(SHOTS, id + '-review.png') });
  await page.locator('.btn-primary', { hasText: /결제하기|Pay/ }).click();
  const pay = won(await page.locator('#payAmount').textContent());
  return { drawer, review, pay };
}

const ORDERS = {
  // h3 (Korean): 활주로 라거 500ml x2 (age 예) + 버터감자칩 x1 (1+1)
  async h3(page) {
    await start(page, '한국어');
    await category(page, '음료');
    await addSimple(page, '활주로 라거 500ml', 2, '예');
    await category(page, '간식');
    await addSimple(page, '버터감자칩', 1);
  },
  // h5 (Korean): 아메리카노 ICE/라지/샷 x2 x1 + 카페라떼 HOT/레귤러 x2
  async h5(page) {
    await start(page, '한국어');
    await category(page, '음료');
    await addWithOptions(page, '아메리카노', ['ICE 차갑게', '라지'], { shots: 2 });
    await addWithOptions(page, '카페라떼', ['HOT 따뜻하게'], { qty: 2 });
  },
  // h10 (English): hot dog + sandwich + lager + banana milk x3 + power bank
  async h10(page) {
    await start(page, 'English');
    await category(page, 'Sandwich & Bakery');
    await addWithOptions(page, 'Classic Hot Dog', ['Honey Mustard']);
    await addWithOptions(page, 'Ham & Cheese Sandwich', ['Heat it']);
    await category(page, 'Drinks');
    await addSimple(page, 'Runway Lager 500ml', 1, 'Yes');
    await addSimple(page, 'Honey Banana Milk', 3);
    await category(page, 'Travel Goods');
    await addSimple(page, 'Portable Power Bank', 1);
  }
};

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  let allOk = true;
  for (const id of Object.keys(ORDERS)) {
    const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await ORDERS[id](page);
    const shown = await checkout(page, id);
    const expected = KEY.holdoutOrders.find((h) => h.id === id).expectedTotal;
    const ok = shown.drawer === expected && shown.review === expected && shown.pay === expected && !errors.length;
    allOk = allOk && ok;
    console.log(`${id}: drawer ${shown.drawer} / review ${shown.review} / pay ${shown.pay}  expected ${expected}  ${ok ? 'MATCH' : 'MISMATCH'}` +
      (errors.length ? '  page errors: ' + errors.join('; ') : ''));
    await page.close();
  }
  await browser.close();
  console.log(allOk ? 'ALL MATCH' : 'SOME MISMATCH');
  process.exit(allOk ? 0 : 1);
})();
