// Self-check: places holdout orders h3, h6, h8 in the kiosk by hand-written steps
// and prints the kiosk's displayed total vs the answer key.
// Usage: node selfcheck/run.mjs
import { chromium } from '/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const key = JSON.parse(readFileSync(path.join(root, 'answer-key.json'), 'utf8'));
const appUrl = pathToFileURL(path.join(root, 'app', 'index.html')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const won = (s) => Number(String(s).replace(/[^0-9]/g, ''));

// ---------- small UI helpers ----------
const ui = (page) => ({
  start: async (dine) => {
    await page.goto(appUrl);
    await page.click('#attract-tap');
    await page.click(`.dine-btn[data-dine="${dine}"]`);
  },
  chip: (label) => page.click(`#chips .chip:text-is("${label}")`),
  card: (name) => page.click(`#grid .card:has(.nm:text-is("${name}"))`),
  radio: (label) => page.click(`.sheet label.radio:has(span:text-is("${label}"))`),
  topping: async (label, n) => {
    for (let i = 0; i < n; i++) await page.click(`.sheet .trow:has(.tn:text-is("${label}")) .sbtn[data-d="1"]`);
  },
  choice: (label) => page.click(`.sheet .choice:has(.c-nm:text-is("${label}"))`),
  sheetBtn: (label) => page.click(`.sheet button:has-text("${label}")`),
  cartPlus: (name, n) => (async () => {
    for (let i = 0; i < n; i++) await page.click(`#cart-list .cline:has(.cl-name:text-is("${name}")) button[data-q="1"]`);
  })(),
  finish: async () => {
    const cartTotal = await page.textContent('#cart-total');
    await page.click('#btn-order');
    const reviewTotal = await page.textContent('#review-total');
    await page.click('#review-ok');
    const payTotal = await page.textContent('#pay-total');
    return { cartTotal, reviewTotal, payTotal };
  }
});

// ---------- hand-written orders ----------
const orders = {
  // 라멘 기본 세트: 탄탄멘(부드럽게) / 가라아게 / 유자 에이드
  h3: async (k) => {
    await k.start('매장');
    await k.chip('세트');
    await k.card('라멘 기본 세트');
    await k.choice('탄탄멘');
    await k.radio('부드럽게');
    await k.sheetBtn('다음');
    await k.choice('가라아게 (4조각)');
    await k.sheetBtn('다음');
    await k.choice('유자 에이드');
    await k.sheetBtn('담기');
    return k.finish();
  },
  // 포장: 미소 라멘(보통, 김×3) + 라멘 든든 세트: 차슈 듬뿍(꼬들) / 미니 차슈덮밥 / 우롱차
  h6: async (k) => {
    await k.start('포장');
    await k.chip('라멘');
    await k.card('미소 라멘');
    await k.radio('보통');
    await k.topping('김', 3);
    await k.sheetBtn('담기');
    await k.chip('세트');
    await k.card('라멘 든든 세트');
    await k.choice('차슈 듬뿍 라멘');
    await k.radio('꼬들');
    await k.sheetBtn('다음');
    await k.choice('미니 차슈덮밥');
    await k.sheetBtn('다음');
    await k.choice('우롱차');
    await k.sheetBtn('담기');
    return k.finish();
  },
  // 매운 돈코츠 라멘(꼬들, 계란×2) ×2 via cart + , 공기밥 ×1
  h8: async (k) => {
    await k.start('매장');
    await k.card('매운 돈코츠 라멘');
    await k.radio('꼬들');
    await k.topping('계란', 2);
    await k.sheetBtn('담기');
    await k.cartPlus('매운 돈코츠 라멘', 1);
    await k.chip('사이드');
    await k.card('공기밥');
    return k.finish();
  }
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let allOk = true;
for (const id of Object.keys(orders)) {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  const res = await orders[id](ui(page));
  const expected = key.holdoutOrders.find((h) => h.id === id).expectedTotal;
  const shown = won(res.payTotal);
  const ok = shown === expected && won(res.reviewTotal) === expected && won(res.cartTotal) === expected && dialogs.length === 0;
  allOk = allOk && ok;
  console.log(`${id}: kiosk=${res.payTotal} (review ${res.reviewTotal}, cart ${res.cartTotal}) expected=${expected.toLocaleString('en-US')}원 -> ${ok ? 'MATCH' : 'MISMATCH'}${dialogs.length ? ' alerts=' + JSON.stringify(dialogs) : ''}`);
  await page.close();
}
await browser.close();
console.log(allOk ? 'ALL 3 MATCH' : 'SOME MISMATCH');
process.exit(allOk ? 0 : 1);
