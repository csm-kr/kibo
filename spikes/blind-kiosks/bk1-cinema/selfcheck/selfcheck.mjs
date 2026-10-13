// Self-check: places 3 holdout orders (h2, h3, h6) by hand in the kiosk and
// compares the total shown on the payment screen with answer-key.json.
// Run: node selfcheck/selfcheck.mjs [--shots]
import { chromium } from '/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const appUrl = pathToFileURL(path.join(here, '..', 'app', 'index.html')).href;
const key = JSON.parse(readFileSync(path.join(here, '..', 'answer-key.json'), 'utf8'));
const shots = process.argv.includes('--shots');
const shotDir = path.join(here, 'shots');
if (shots) mkdirSync(shotDir, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const won = (t) => Number(String(t).replace(/[^0-9]/g, ''));

function helpers(page) {
  const h = {
    async start(pickupLabel) {
      await page.locator('.attract').click();
      await page.getByText(pickupLabel, { exact: true }).click();
    },
    async tab(label) { await page.getByRole('tab', { name: label, exact: true }).click(); },
    // Tap a menu card by name, paging forward with ▶ if it is not on the current page.
    async card(name) {
      const loc = page.locator(`.mcard:has(.mc-name:text-is("${name}"))`);
      for (let i = 0; i < 5 && (await loc.count()) === 0; i++) await page.locator('.pg', { hasText: '▶' }).click();
      await loc.click();
    },
    // Tap an option chip by its label (label may be followed by a "+500원" delta).
    async opt(label, groupTitle) {
      const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\+|$)');
      const scope = groupTitle ? page.locator('.modal .og').filter({ has: page.locator('.og-title', { hasText: groupTitle }) }) : page.locator('.modal');
      await scope.locator('.opt').filter({ hasText: re }).first().click();
    },
    async btn(text) { await page.locator('.modal button, .modal .btn-primary').filter({ hasText: new RegExp('^' + text + '$') }).first().click(); },
    async plus(label, n = 1) { for (let i = 0; i < n; i++) await page.getByRole('button', { name: label + ' 더하기', exact: true }).click(); },
    async qty(n) { for (let i = 1; i < n; i++) await page.getByRole('button', { name: '수량 더하기' }).last().click(); },
    async err() { const e = page.locator('.modal .err'); return (await e.count()) ? (await e.innerText()).trim() : ''; },
    async addFromModal() { await page.locator('.modal .btn-primary', { hasText: '담기' }).click(); },
    async shot(name) { if (shots) await page.screenshot({ path: path.join(shotDir, name + '.png') }); },
    async finish() {
      await page.getByRole('button', { name: '주문하기' }).click();
      await h.shot('review');
      await page.getByRole('button', { name: '결제하기' }).click();
      return won(await page.locator('#pay-total').innerText());
    }
  };
  return h;
}

const orders = {
  // 커플 콤보 M, 반반(카라멜+치즈), 콜라 1 + 레몬에이드 1, upsell yes; pickup now
  async h2(page, h) {
    await h.start('지금 바로 수령');
    await h.tab('콤보');
    await h.card('커플 콤보');
    await h.btn('다음');
    await h.btn('다음');
    const e1 = await h.err();
    if (!e1.includes('사이즈')) throw new Error('expected size error, got: ' + e1);
    await h.opt('M (기본)');
    await h.btn('다음');
    await h.opt('반반');
    await h.opt('카라멜', '반반 맛 선택');
    await h.btn('다음');
    const e2 = await h.err();
    if (!e2.includes('정확히 2가지')) throw new Error('expected half-and-half error, got: ' + e2);
    await h.opt('치즈', '반반 맛 선택');
    await h.shot('h2-flavor');
    await h.btn('다음');
    await h.plus('콜라');
    await h.plus('레몬에이드');
    await h.btn('다음');
    await h.shot('h2-confirm');
    await h.btn('장바구니 담기');
    await h.shot('h2-upsell');
    await page.getByText('네, 추가할게요', { exact: true }).click();
    await h.shot('h2-menu');
    return h.finish();
  },
  // 반반 팝콘 L (오리지널+어니언) x1, 아메리카노 ICE L x2; pickup before
  async h3(page, h) {
    await h.start('상영관 입장 전 수령');
    await h.tab('팝콘');
    await h.card('반반 팝콘');
    await h.opt('L');
    await h.opt('오리지널');
    await h.addFromModal();
    const e = await h.err();
    if (!e.includes('정확히 2가지')) throw new Error('expected half-and-half error, got: ' + e);
    await h.opt('어니언');
    await h.shot('h3-half');
    await h.addFromModal();
    await h.tab('음료');
    await h.card('아메리카노');
    await h.opt('ICE');
    await h.opt('L');
    await h.qty(2);
    await h.addFromModal();
    return h.finish();
  },
  // 클래식 핫도그 +치즈 +크리스피 어니언, 칠리 핫도그 (no topping), 슬러시 딸기 x2; pickup now
  async h6(page, h) {
    await h.start('지금 바로 수령');
    await h.tab('핫푸드');
    await h.card('클래식 핫도그');
    await h.opt('치즈');
    await h.opt('크리스피 어니언');
    await h.addFromModal();
    await h.card('칠리 핫도그');
    await h.addFromModal();
    await h.tab('디저트');
    await h.card('슬러시');
    await h.addFromModal();
    const e = await h.err();
    if (!e.includes('맛')) throw new Error('expected flavor error, got: ' + e);
    await h.opt('딸기');
    await h.qty(2);
    await h.addFromModal();
    return h.finish();
  }
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = 0;
for (const id of Object.keys(orders)) {
  const expected = key.holdoutOrders.find((o) => o.id === id).expectedTotal;
  const page = await browser.newPage({ viewport: { width: 560, height: 980 } });
  const h = helpers(page);
  await page.goto(appUrl);
  let shown;
  try {
    shown = await orders[id](page, h);
    await h.shot(id + '-pay');
  } catch (err) {
    shown = 'ERROR: ' + err.message;
  }
  const ok = shown === expected;
  if (!ok) failed++;
  console.log(`${id}: kiosk shows ${typeof shown === 'number' ? shown.toLocaleString('en-US') + '원' : shown} | expected ${expected.toLocaleString('en-US')}원 | ${ok ? 'MATCH' : 'MISMATCH'}`);
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} mismatch(es)` : 'All 3 totals match the answer key.');
process.exit(failed ? 1 : 0);
