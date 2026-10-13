// Self-check: places holdout orders h1, h3 and h4 by hand-written Playwright steps and compares
// the payment-screen total with answer-key.json. Also re-adds every holdout total from the key's own catalog.
// Run from a directory whose node_modules has Playwright:  node /path/to/selfcheck/run.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = pathToFileURL(path.join(HERE, '..', 'app', 'index.html')).href;
const KEY = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'answer-key.json'), 'utf8'));
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const won = (n) => n.toLocaleString('en-US') + '원';
const digits = (s) => Number(String(s).replace(/[^0-9]/g, ''));
function expect(cond, msg) { if (!cond) throw new Error('assertion failed: ' + msg); }

// ---------- 1. answer-key arithmetic (catalog -> expectedTotal) ----------
function keyTotal(order) {
  let sum = 0;
  for (const line of order.lines) {
    const item = KEY.items.find((i) => i.name === line.item);
    expect(item, 'item in key: ' + line.item);
    expect(!item.soldOut, 'holdout uses a sold-out item: ' + line.item);
    if (item.takeoutOnly) expect(order.mode === 'takeout', 'takeout-only item in dine-in order: ' + line.item);
    let unit = item.basePrice;
    for (const g of item.optionGroups) {
      const grp = KEY.optionGroups[g];
      const picked = line.options[g] || [];
      if (grp.required) expect(picked.length >= grp.min, `${order.id} ${line.item} misses required ${g}`);
      expect(picked.length <= grp.max, `${order.id} ${line.item} too many in ${g}`);
      for (const o of picked) unit += grp.options.find((x) => x.id === o).priceDelta;
    }
    for (const g of Object.keys(line.options)) expect(item.optionGroups.includes(g), `${line.item} has no group ${g}`);
    sum += unit * line.qty;
  }
  for (const [g, ids] of Object.entries(order.orderOptions || {})) {
    expect(order.mode === 'takeout', 'bag only for takeout');
    for (const o of ids) sum += KEY.optionGroups[g].options.find((x) => x.id === o).priceDelta;
  }
  return sum;
}
log('== answer-key arithmetic (all holdouts) ==');
let keyOk = true;
for (const o of KEY.holdoutOrders) {
  const t = keyTotal(o);
  const ok = t === o.expectedTotal;
  keyOk = keyOk && ok;
  log(`${o.id.padEnd(4)} recomputed ${won(t).padStart(8)} expected ${won(o.expectedTotal).padStart(8)} ${ok ? 'PASS' : 'FAIL'}`);
}

// ---------- 2. hand-written UI orders ----------
async function start(page, modeLabel) {
  await page.goto(APP);
  await page.getByText('주문하시려면 화면을 터치해 주세요').click();
  await page.getByRole('button', { name: modeLabel }).click();
}
const tab = (page, label) => page.locator('.tab', { hasText: label }).click();
const tile = (page, text) => page.locator('.tile', { hasText: text }).click();
const addBtn = (page) => page.getByRole('button', { name: '장바구니 담기' }).click();

async function checkoutAndReadTotal(page, wantBag) {
  await page.getByText('주문하기', { exact: true }).click();
  await page.getByText('주문 내역을 확인해 주세요').waitFor();
  if (wantBag) await page.getByText('봉투가 필요하신가요?').click();
  const reviewTotal = await page.locator('#rv-total').innerText();
  await page.getByRole('button', { name: '결제하기' }).click();
  const dlg = page.getByRole('dialog', { name: '주문 확인' });
  await dlg.waitFor();
  await dlg.getByRole('button', { name: '확인' }).click();
  await page.getByText('결제 수단을 선택해 주세요').waitFor();
  const payTotal = await page.locator('#pay-total').innerText();
  expect(digits(reviewTotal) === digits(payTotal), `review ${reviewTotal} vs pay ${payTotal}`);
  return digits(payTotal);
}

// h1: dine-in, 얼큰우동 매운맛 + 곱빼기 x2
async function orderH1(page) {
  await start(page, '매장에서 먹기');
  // side check: takeout-only item is refused in a dine-in order
  await tab(page, '음료·간식');
  await tile(page, '선물상자');
  await page.getByRole('alertdialog', { name: '포장 전용 메뉴' }).waitFor();
  await page.getByRole('button', { name: '확인' }).click();

  await tab(page, '면류');
  await tile(page, '얼큰우동');
  await addBtn(page); // no spice yet -> inline error
  await page.getByText('맵기를 선택해 주세요.').waitFor();
  await page.locator('.chip', { hasText: '매운맛' }).click();
  await page.locator('label.chk', { hasText: '곱빼기' }).click();
  await page.getByRole('button', { name: '수량 더하기' }).click();
  expect((await page.locator('.st-num').innerText()) === '2', 'stepper shows 2');
  await addBtn(page);
  return checkoutAndReadTotal(page, false);
}

// h3: takeout, 한상세트 (왕돈까스 + 식혜) x1, bag
async function orderH3(page) {
  await start(page, '포장하기');
  await tab(page, '세트');
  await tile(page, '한상세트');
  await page.getByRole('button', { name: '다음' }).click(); // no meal yet -> error
  await page.getByText('식사 메뉴를 선택해 주세요.').waitFor();
  await page.locator('.card', { hasText: '왕돈까스' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.locator('.card', { hasText: '식혜' }).click();
  await page.getByRole('button', { name: '이전' }).click(); // back and forth keeps choices
  expect(await page.locator('.card.on', { hasText: '왕돈까스' }).count() === 1, '이전 keeps meal');
  await page.getByRole('button', { name: '다음' }).click();
  expect(await page.locator('.card.on', { hasText: '식혜' }).count() === 1, 'drink kept');
  await addBtn(page);
  return checkoutAndReadTotal(page, true);
}

// h4: takeout, 호두과자 선물상자 x1 + 호두과자 (소) x2 (from 추천), bag
async function orderH4(page) {
  await start(page, '포장하기');
  // side check: sold-out item
  await tab(page, '분식');
  await tile(page, '순대');
  await page.getByRole('alertdialog', { name: '품절 안내' }).waitFor();
  await page.getByRole('button', { name: '확인' }).click();

  await tab(page, '음료·간식');
  await tile(page, '선물상자');
  await addBtn(page);
  await tab(page, '추천');
  await tile(page, '호두과자 (소)');
  await page.getByRole('button', { name: '수량 더하기' }).click();
  await addBtn(page);
  return checkoutAndReadTotal(page, true);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
page.on('request', (r) => { if (!r.url().startsWith('file:')) pageErrors.push('network request: ' + r.url()); });

log('');
log('== UI orders (Playwright, chromium, ' + APP.replace(/^.*\/blind-fresh\//, 'blind-fresh/') + ') ==');
let uiOk = true;
for (const [id, fn] of [['h1', orderH1], ['h3', orderH3], ['h4', orderH4]]) {
  const expected = KEY.holdoutOrders.find((o) => o.id === id).expectedTotal;
  let got = null, err = null;
  try { got = await fn(page); } catch (e) { err = e.message.split('\n')[0]; }
  const ok = got === expected;
  uiOk = uiOk && ok;
  log(`${id.padEnd(4)} kiosk ${got === null ? 'ERROR' : won(got).padStart(8)} expected ${won(expected).padStart(8)} ${ok ? 'PASS' : 'FAIL'}${err ? ' (' + err + ')' : ''}`);
}
await browser.close();
log('page errors / network requests: ' + (pageErrors.length ? pageErrors.join(' | ') : 'none'));
log('');
log('OVERALL: ' + (keyOk && uiOk && !pageErrors.length ? 'PASS' : 'FAIL'));
fs.writeFileSync(path.join(HERE, 'RESULT.txt'), out.join('\n') + '\n');
process.exit(keyOk && uiOk && !pageErrors.length ? 0 : 1);
