// Places every holdout order from answer-key.json in the kiosk UI and compares the
// total on the payment screen with expectedTotal. It also recomputes each total from
// the answer key's own price data. Writes selfcheck/RESULT.txt.
// Usage: node selfcheck/place-orders.mjs
import { chromium } from '/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const url = 'file://' + path.join(root, 'app/index.html');
const key = JSON.parse(fs.readFileSync(path.join(root, 'answer-key.json'), 'utf8'));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

const itemByName = Object.fromEntries(key.items.map((i) => [i.name, i]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const won = (n) => n.toLocaleString('en-US') + '원';
const digits = (s) => Number(String(s).replace(/[^0-9]/g, ''));

// Total computed from the answer key alone.
function keyTotal(order) {
  let total = 0;
  for (const line of order.lines) {
    const item = itemByName[line.item];
    let unit = item.basePrice;
    for (const [g, ids] of Object.entries(line.options)) {
      const G = key.optionGroups[g];
      ids.forEach((id, i) => {
        if (G.freeFirst && i < G.freeFirst) return;
        unit += G.options.find((o) => o.id === id).priceDelta;
      });
    }
    total += unit * line.qty;
  }
  return total;
}

// Extra steps some orders exercise (cart edits, sold-out tap). Not part of the final order.
const SPECIAL = {
  h6: { qtyViaCart: ['허니버터치킨'], addThenDelete: { cat: '사이드', item: '콘샐러드' } },
  h9: { soldOutTap: { cat: '치킨', item: '파닭치킨' } },
};

async function openCategory(page, label) {
  await page.locator('.tab', { hasText: new RegExp('^' + esc(label) + '$') }).click();
}
function card(page, name) {
  return page.locator('.card').filter({ has: page.locator('.nm', { hasText: new RegExp('^' + esc(name) + '[0-9,]+원$') }) });
}
function cartLine(page, name) {
  return page.locator('.cl').filter({ has: page.locator('.cl-nm', { hasText: new RegExp('^' + esc(name) + '$') }) });
}
async function cartCount(page) {
  return digits(await page.locator('.cf-sum b').innerText());
}

async function placeLine(page, line, special, log) {
  const item = itemByName[line.item];
  await openCategory(page, item.category);
  await card(page, line.item).click();
  if (item.ageCheck) {
    await page.locator('.dlg', { hasText: '만 19세 이상이십니까?' }).waitFor();
    await page.getByRole('button', { name: '네, 19세 이상입니다' }).click();
    log.push(`  age popup confirmed for ${line.item}`);
  }
  const groups = item.optionGroups.filter((g) => g !== 'colaUpsize');
  const viaCart = (special?.qtyViaCart || []).includes(line.item);
  if (groups.length) {
    const sheet = page.locator('.sheet');
    await sheet.waitFor();
    for (const g of groups) {
      const G = key.optionGroups[g];
      const grp = sheet.locator('.grp').filter({ has: page.locator('.gt', { hasText: new RegExp('^' + esc(G.title) + '$') }) });
      if ((await grp.count()) !== 1) throw new Error(`group "${G.title}" not found once for ${line.item}`);
      for (const id of line.options[g] || []) {
        const label = G.options.find((o) => o.id === id).label;
        const opt = grp.locator('.opt').filter({ has: page.locator('.ol', { hasText: new RegExp('^' + esc(label) + '$') }) });
        const already = (await opt.getAttribute('class')).split(' ').includes('on');
        if (!already) await opt.click();
      }
    }
    if (!viaCart) for (let i = 1; i < line.qty; i++) await sheet.locator('[data-act="minc"]').click();
    log.push(`  popup total for ${line.item}: ${await sheet.locator('.mf-sum b').innerText()}`);
    await page.getByRole('button', { name: '장바구니 담기' }).click();
    if (item.optionGroups.includes('colaUpsize')) {
      const up = page.locator('.dlg', { hasText: '콜라 1.25L로 변경하시겠어요? +1,000원' });
      await up.waitFor();
      const yes = (line.options.colaUpsize || []).includes('cola125');
      await page.getByRole('button', { name: yes ? '변경할게요' : '아니요' }).click();
      log.push(`  upsell popup → ${yes ? '변경할게요' : '아니요'}`);
    }
  }
  // no-option items enter the cart at 1; the rest of the quantity goes through the cart + button
  const extra = groups.length && !viaCart ? 0 : line.qty - 1;
  if (extra > 0) {
    const cl = cartLine(page, line.item).last();
    for (let i = 0; i < extra; i++) await cl.locator('[data-act="qinc"]').click();
    log.push(`  raised ${line.item} to ${line.qty} with cart +`);
  }
}

async function runOrder(browser, order) {
  const log = [];
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.locator('.attract').click();
  await page.locator('.dine-btn', { hasText: order.dine }).click();
  if (order.pickupTime) {
    await page.locator('.slot', { hasText: new RegExp('^' + esc(order.pickupTime) + '$') }).click();
    await page.getByRole('button', { name: '확인' }).click();
  }
  const badge = await page.locator('.dine-badge').innerText();
  log.push(`  header badge: ${badge}`);
  const special = SPECIAL[order.id];

  if (special?.soldOutTap) {
    await openCategory(page, special.soldOutTap.cat);
    const before = await cartCount(page);
    await card(page, special.soldOutTap.item).click();
    const toast = await page.locator('#toast').innerText();
    const after = await cartCount(page);
    if (toast !== '죄송합니다. 품절된 메뉴입니다.' || before !== after) throw new Error('sold-out check failed');
    log.push(`  sold-out tap on ${special.soldOutTap.item}: toast "${toast}", cart unchanged`);
  }

  for (const line of order.lines) await placeLine(page, line, special, log);

  if (special?.addThenDelete) {
    const { cat, item } = special.addThenDelete;
    await openCategory(page, cat);
    await card(page, item).click();
    const withExtra = await cartCount(page);
    await cartLine(page, item).locator('[data-act="del"]').click();
    await page.locator('.dlg', { hasText: '선택한 메뉴를 장바구니에서 삭제하시겠습니까?' }).waitFor();
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    const afterDel = await cartCount(page);
    if (afterDel !== withExtra - 1 || (await cartLine(page, item).count()) !== 0) throw new Error('delete check failed');
    log.push(`  added ${item} then deleted it via ✕ → 삭제 (cart ${withExtra} → ${afterDel})`);
  }

  const cartTotal = digits(await page.locator('.cf-amt').innerText());
  await page.getByRole('button', { name: '주문하기' }).click();
  const reviewTotal = digits(await page.locator('.rv-amt').innerText());
  await page.getByRole('button', { name: '결제하기' }).click();
  await page.locator('.pay-q', { hasText: '결제 수단을 선택해 주세요' }).waitFor();
  const payText = await page.locator('.pay-amt').innerText();
  const payTotal = digits(payText);
  await page.screenshot({ path: path.join(shots, `${order.id}-payment.png`) });
  await page.locator('.pm', { hasText: '신용·체크카드' }).click();
  const waiting = await page.locator('.dlg').innerText();
  const stopped = waiting.includes('결제 취소') && !/완료|승인/.test(waiting);
  await page.close();
  return { log, errors, cartTotal, reviewTotal, payTotal, payText: payText.replace(/\s+/g, ' '), stopped };
}

// Catalog, option labels/prices and rule messages compared with the answer key.
function deltaText(n) {
  return n > 0 ? '+' + won(n) : n < 0 ? '-' + won(-n) : '';
}
async function uiChecks(browser) {
  const res = [];
  const check = (name, ok, detail = '') => res.push({ name, ok, detail });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page.goto(url);
  await page.locator('.attract').click();
  await page.locator('.dine-btn', { hasText: '포장 주문' }).click();
  await page.getByRole('button', { name: '확인' }).click();
  check('pickup: 확인 without a slot shows error', (await page.locator('.err-msg').innerText()) === '픽업 시간을 선택해 주세요.');
  await page.getByRole('button', { name: '이전' }).click();
  await page.locator('.dine-btn', { hasText: '매장 식사' }).click();

  // catalog
  const uiTabs = await page.locator('.tab').allInnerTexts();
  check('category tabs match key', JSON.stringify(uiTabs) === JSON.stringify(key.categories.map((c) => c.label)), uiTabs.join(' / '));
  let catalogOk = true;
  const catalogDiff = [];
  for (const c of key.categories) {
    await openCategory(page, c.label);
    const cards = await page.locator('.card').evaluateAll((els) => els.map((e) => ({
      name: e.querySelector('.nm').firstChild.textContent,
      price: e.querySelector('.pr').textContent,
      soldOut: e.classList.contains('so'),
    })));
    const want = key.items.filter((i) => i.category === c.label).map((i) => ({ name: i.name, price: won(i.basePrice), soldOut: i.soldOut }));
    if (JSON.stringify(cards) !== JSON.stringify(want)) { catalogOk = false; catalogDiff.push(c.label); }
  }
  check('every card name / price / sold-out matches key', catalogOk, catalogDiff.join(','));

  // option groups per item
  let optOk = true;
  const optDiff = [];
  for (const item of key.items.filter((i) => !i.soldOut && i.optionGroups.length)) {
    await openCategory(page, item.category);
    await card(page, item.name).click();
    const ui = await page.locator('.sheet .grp:not(.qty-g)').evaluateAll((els) => els.map((g) => ({
      title: g.querySelector('.gt').textContent,
      required: !!g.querySelector('.req'),
      options: [...g.querySelectorAll('.opt')].map((o) => ({
        label: o.querySelector('.ol').textContent, price: o.querySelector('.op').textContent, on: o.classList.contains('on'),
      })),
    })));
    const want = item.optionGroups.filter((g) => g !== 'colaUpsize').map((gid) => {
      const G = key.optionGroups[gid];
      return {
        title: G.title, required: G.required,
        options: G.options.map((o) => ({
          label: o.label,
          price: o.soldOut ? '품절' : G.freeFirst ? '무료' : deltaText(o.priceDelta),
          on: G.default === o.id,
        })),
      };
    });
    if (JSON.stringify(ui) !== JSON.stringify(want)) { optOk = false; optDiff.push(item.name); }
    await page.getByRole('button', { name: '취소' }).click();
  }
  check('option groups (title, required, labels, price text, default) match key for every item', optOk, optDiff.join(','));

  // rule messages
  await openCategory(page, '치킨');
  await card(page, '바삭 후라이드').click();
  await page.getByRole('button', { name: '장바구니 담기' }).click();
  const boneErr = await page.locator('.grp', { hasText: '뼈/순살 선택' }).locator('.g-err').innerText();
  check('bone required: 담기 without 뼈/순살 is refused', boneErr === '필수 선택 항목입니다.' && (await page.locator('.m-msg').innerText()) === '필수 옵션을 모두 선택해 주세요.' && (await cartCount(page)) === 0);
  const sauce = page.locator('.grp', { hasText: '소스 추가' });
  for (const l of ['양념소스', '허니머스타드', '갈릭마요']) await sauce.locator('.opt', { hasText: l }).click();
  const prices = await sauce.locator('.op').allInnerTexts();
  check('sauce price text after 3 picks: first 무료, rest +500원', JSON.stringify(prices) === JSON.stringify(['무료', '+500원', '+500원', '+500원']), prices.join(','));
  await sauce.locator('.opt', { hasText: '매운디핑소스' }).click();
  check('sauce 4th pick refused', (await sauce.locator('.g-err').innerText()) === '소스는 최대 3개까지 선택할 수 있습니다.' && (await sauce.locator('.opt.on').count()) === 3);
  await page.locator('.grp', { hasText: '뼈/순살 선택' }).locator('.opt', { hasText: '순살' }).click();
  check('popup 합계 = 18,000 + 2,000 + 2×500', (await page.locator('.mf-sum b').innerText()) === '21,000원');
  await page.getByRole('button', { name: '취소' }).click();

  await openCategory(page, '반반');
  await card(page, '반반치킨').click();
  const fl = page.locator('.grp', { hasText: '반반 맛 선택' });
  await fl.locator('.opt', { hasText: /^후라이드/ }).click();
  await page.locator('.grp', { hasText: '뼈/순살 선택' }).locator('.opt', { hasText: '뼈' }).click();
  await page.getByRole('button', { name: '장바구니 담기' }).click();
  check('반반 with 1 flavor refused', (await fl.locator('.g-err').innerText()) === '반반 맛을 2가지 선택해 주세요. (현재 1가지)');
  await fl.locator('.opt', { hasText: '파닭' }).click();
  check('반반 파닭 flavor sold out', (await fl.locator('.g-err').innerText()) === '품절된 맛입니다. 다른 맛을 선택해 주세요.' && (await fl.locator('.opt.on').count()) === 1);
  await fl.locator('.opt', { hasText: /^양념/ }).click();
  await fl.locator('.opt', { hasText: '허니버터' }).click();
  check('반반 3rd flavor refused', (await fl.locator('.g-err').innerText()) === '맛은 2가지까지만 선택할 수 있습니다.' && (await fl.locator('.opt.on').count()) === 2);
  await page.getByRole('button', { name: '취소' }).click();

  await openCategory(page, '음료/주류');
  await card(page, '생맥주 500cc').click();
  await page.getByRole('button', { name: '아니요' }).click();
  check('주류 age 아니요 blocks', (await page.locator('.dlg').innerText()).includes('만 19세 미만 고객은 주류를 주문할 수 없습니다.') && (await cartCount(page)) === 0);
  await page.getByRole('button', { name: '확인' }).click();

  await page.getByRole('button', { name: '주문하기' }).click();
  check('주문하기 with empty cart refused', (await page.locator('#toast').innerText()) === '메뉴를 먼저 선택해 주세요.' && (await page.locator('.rv-amt').count()) === 0);

  await openCategory(page, '세트');
  await card(page, '혼닭세트').click();
  await page.locator('.grp', { hasText: '치킨 맛 선택' }).locator('.opt', { hasText: '후라이드' }).click();
  await page.locator('.grp', { hasText: '뼈/순살 선택' }).locator('.opt', { hasText: '뼈' }).click();
  await page.getByRole('button', { name: '장바구니 담기' }).click();
  check('혼닭세트 shows no upsell popup', (await page.locator('.dlg').count()) === 0 && (await cartCount(page)) === 1);
  await page.locator('.ch-clear').click();
  await page.getByRole('button', { name: '전체삭제' }).click();
  check('전체삭제 with confirmation empties cart', (await cartCount(page)) === 0);
  await page.close();
  return res;
}

const browser = await chromium.launch();
const out = [];
let pass = 0;
out.push(`bk10-chicken self-check — ${key.holdoutOrders.length} holdout orders placed in the UI`);
out.push(`app: ${url}`);
out.push('');
for (const order of key.holdoutOrders) {
  let r;
  try {
    r = await runOrder(browser, order);
  } catch (e) {
    out.push(`${order.id}: FAIL (${e.message})`);
    continue;
  }
  const kt = keyTotal(order);
  const ok = r.payTotal === order.expectedTotal && r.reviewTotal === order.expectedTotal &&
    r.cartTotal === order.expectedTotal && kt === order.expectedTotal && r.stopped && !r.errors.length;
  if (ok) pass++;
  out.push(`${order.id}: ${ok ? 'PASS' : 'FAIL'}  dine=${order.dine}${order.pickupTime ? ' / ' + order.pickupTime : ''}`);
  out.push(`  expectedTotal ${won(order.expectedTotal)} | key recompute ${won(kt)} | cart ${won(r.cartTotal)} | review 총 결제 금액 ${won(r.reviewTotal)} | payment screen "${r.payText}"`);
  out.push(...r.log);
  out.push(`  payment stopped at method screen (waiting popup, no charge): ${r.stopped}`);
  if (r.errors.length) out.push(`  page errors: ${r.errors.join(' | ')}`);
  out.push(`  patterns: ${order.patterns.join(', ')}`);
  out.push('');
}
let checks = [];
try {
  checks = await uiChecks(browser);
} catch (e) {
  checks = [{ name: 'ui checks crashed', ok: false, detail: e.message }];
}
out.push('UI rule checks (answer key vs screens):');
for (const c of checks) out.push(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${!c.ok && c.detail ? ' [' + c.detail + ']' : ''}`);
const checksOk = checks.every((c) => c.ok);
out.push('');
await browser.close();
const counts = key.categories.map((c) => `${c.label} ${c.itemCount}`).join(', ');
const real = key.categories.every((c) => key.items.filter((i) => i.category === c.label).length === c.itemCount);
out.push(`items: ${key.items.length} in ${key.categories.length} categories (${counts}); category counts match items list: ${real}`);
out.push(`RESULT: ${pass}/${key.holdoutOrders.length} holdout orders PASS; UI rule checks ${checks.filter((c) => c.ok).length}/${checks.length} PASS`);
const text = out.join('\n') + '\n';
fs.writeFileSync(path.join(here, 'RESULT.txt'), text);
console.log(text);
process.exit(pass === key.holdoutOrders.length && real && checksOk ? 0 : 1);
