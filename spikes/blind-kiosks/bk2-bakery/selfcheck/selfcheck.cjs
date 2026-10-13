// Self-check: places holdout orders h1, h2 and h4 by hand-written steps and
// prints the kiosk's displayed total next to the answer key's expected total.
// Run: node selfcheck/selfcheck.cjs
const path = require('path');
const { chromium } = require('/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const KEY = require(path.join(ROOT, 'answer-key.json'));
const APP = 'file://' + path.join(ROOT, 'app', 'index.html');

const exact = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const won = (n) => n.toLocaleString('en-US') + '원';

// Every tap goes through here: if the inactivity warning pops up, continue the order.
async function tap(page, loc, log) {
  await loc.click();
  if (await page.locator('#idle').isVisible()) {
    log.push('inactivity warning "' + (await page.locator('#idle h3').innerText()) + '" -> 계속 주문하기');
    await page.locator('#idle-continue').click();
  }
}
const card = (page, name) => page.locator('#grid .card').filter({ has: page.locator('.nm', { hasText: exact(name) }) });
const tab = (page, label) => page.locator('#tabs .tab', { hasText: exact(label) });
const group = (page, title) => page.locator('#opt-body .grp').filter({ has: page.locator('.grp-title', { hasText: title }) });
const chip = (page, title, label) => group(page, title).locator('.choice', { hasText: label });
const shotPlus = (page) => group(page, '샷 추가').locator('button', { hasText: '+' });
const qtyPlus = (page) => page.locator('#opt-modal .qty-row button', { hasText: '+' });
const addBtn = (page) => page.locator('#opt-modal button', { hasText: '담기' });

async function checkout(page, log) {
  await tap(page, page.locator('.btn-order'), log);                       // 주문하기
  const review = await page.locator('#review-total').innerText();
  await tap(page, page.locator('#scr-review button', { hasText: '결제하기' }), log);
  await tap(page, page.locator('#dlg-ok', { hasText: '결제하기' }), log);  // confirmation
  const pay = await page.locator('#pay-total').innerText();
  if (review !== pay) log.push('WARNING review total ' + review + ' != payment total ' + pay);
  return pay;
}

async function start(page, typeLabel, log) {
  await page.goto(APP);
  await page.locator('#attract-touch').click();
  await tap(page, page.locator('.type-card', { hasText: typeLabel }), log);
}

// h1: 아이스 카페라떼(얼음 적게, 샷 2) x1 + 소금빵 x2, dine-in
async function h1(page, log) {
  await start(page, '매장에서 먹어요', log);
  await tap(page, card(page, '카페라떼'), log);
  await tap(page, chip(page, '온도 선택', 'ICED'), log);
  await tap(page, chip(page, '얼음 양', '적게'), log);
  await tap(page, shotPlus(page), log);
  await tap(page, shotPlus(page), log);
  await tap(page, addBtn(page), log);
  await tap(page, tab(page, '빵'), log);
  await tap(page, card(page, '소금빵'), log);
  await tap(page, qtyPlus(page), log);
  await tap(page, addBtn(page), log);
  return checkout(page, log);
}

// h2: 아메리카노 HOT(바닐라+헤이즐넛 시럽) x2 + 버터 크루아상(데움) x1, take-out
async function h2(page, log) {
  await start(page, '포장해 갈게요', log);
  await tap(page, card(page, '아메리카노'), log);
  await tap(page, chip(page, '온도 선택', 'HOT'), log);
  await tap(page, chip(page, '시럽 추가', '바닐라 시럽'), log);
  await tap(page, chip(page, '시럽 추가', '헤이즐넛 시럽'), log);
  await tap(page, chip(page, '시럽 추가', '카라멜 시럽'), log);     // third syrup -> error expected
  log.push('3rd syrup error: "' + (await page.locator('#opt-err').innerText()) + '"');
  await tap(page, addBtn(page), log);
  await tap(page, page.locator('#cart-lines .line', { hasText: '아메리카노' }).locator('button', { hasText: '+' }), log);
  await tap(page, tab(page, '빵'), log);
  await tap(page, card(page, '버터 크루아상'), log);
  await tap(page, chip(page, '데우기', '따뜻하게 데워 주세요'), log);
  await tap(page, addBtn(page), log);
  return checkout(page, log);
}

// h4: 아이스 카페모카(얼음 보통, 샷 3, 오트 밀크) x1 + 에그마요 샌드위치 x1, dine-in
async function h4(page, log) {
  await start(page, '매장에서 먹어요', log);
  await tap(page, card(page, '카페모카'), log);
  await tap(page, chip(page, '온도 선택', 'ICED'), log);
  for (let i = 0; i < 4; i++) await tap(page, shotPlus(page), log); // 4th press -> error expected
  log.push('4th shot error: "' + (await page.locator('#opt-err').innerText()) + '"');
  await tap(page, chip(page, '우유 선택', '오트 밀크'), log);
  await tap(page, addBtn(page), log);
  await tap(page, tab(page, '샌드위치'), log);
  await tap(page, card(page, '에그마요 샌드위치'), log);             // no popup, added directly
  return checkout(page, log);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
  const runs = { h1, h2, h4 };
  let ok = true;
  for (const [id, fn] of Object.entries(runs)) {
    const log = [];
    const shown = await fn(page, log);
    const expected = KEY.holdoutOrders.find((h) => h.id === id).expectedTotal;
    const match = shown === won(expected);
    ok = ok && match;
    console.log(`${id}  displayed ${shown.padStart(8)}  expected ${won(expected).padStart(8)}  ${match ? 'MATCH' : 'MISMATCH'}`);
    log.forEach((l) => console.log('     - ' + l));
  }
  await browser.close();
  console.log(ok ? 'ALL 3 MATCH' : 'SELF-CHECK FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
