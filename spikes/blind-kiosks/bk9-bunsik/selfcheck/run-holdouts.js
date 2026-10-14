// Self-check for bk9-bunsik.
// 1) Recomputes every holdout total from the answer key's prices (key consistency).
// 2) Checks the on-screen catalog (categories, items, prices, sold-out, option groups/labels/prices) against the answer key.
// 3) Places all 10 holdout orders through the UI by clicking visible labels, and compares
//    each cart line price, the review '총 결제 금액' and the payment screen '결제하실 금액' with the key.
// Run: node selfcheck/run-holdouts.js   -> writes selfcheck/RESULT.txt
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'app/index.html');
const key = JSON.parse(fs.readFileSync(path.join(ROOT, 'answer-key.json'), 'utf8'));

// Hand-written per-order extras (UI paths exercised on top of the order lines).
const PLAN = {
  h1: { points: '12345678' },
  h2: { qtyVia: 'modal' },
  h3: { decoyDelete: '콜라' },
  h4: { points: '87654321', phoneErrorFirst: true },
  h5: { qtyVia: 'cart', toppingOverflow: '삶은 계란', expectDiscount: 2000 },
  h6: { requiredErrorFirst: '점심 쫄볶이' },
  h7: { points: '55556666' },
  h8: { qtyVia: 'modal' },
  h9: {},
  h10: { clearFirst: '사이다', mergeLine: '보리별 라면' }
};
const PROMO_PRICE = { '로제 떡볶이': 5500 }; // from key.promotions[0]

const log = [];
let failures = 0;
function check(ok, msg) { log.push((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; return ok; }
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (s) => new RegExp('^\\s*' + reEsc(s) + '\\s*$');
const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
const num = (t) => Number(String(t).replace(/[^0-9]/g, ''));
const itemByName = (n) => key.items.find((i) => i.name === n);
const optOf = (gid, id) => key.optionGroups[gid].options.find((o) => o.id === id);

function unitFromKey(line) {
  const it = itemByName(line.item);
  let p = PROMO_PRICE[it.name] != null ? PROMO_PRICE[it.name] : it.basePrice;
  for (const [gid, ids] of Object.entries(line.options || {})) for (const id of ids) p += optOf(gid, id).priceDelta;
  return p;
}

/* ---------------- UI helpers ---------------- */
async function start(page, dineLabel) {
  await page.goto(APP);
  await page.locator('.attract').click();
  await page.locator('.dine-card', { has: page.locator('.dc-label', { hasText: exact(dineLabel) }) }).click();
  await page.locator('.cart').waitFor();
}
async function gotoCategory(page, label) {
  await page.locator('nav.tabs button', { hasText: exact(label) }).click();
}
async function openCard(page, item) {
  await gotoCategory(page, item.category);
  await page.locator('.card').filter({ has: page.locator('.nm', { hasText: exact(item.name) }) }).click();
  await page.locator('.sheet').waitFor();
}
function section(page, gid) {
  return page.locator('.sheet section.og').filter({ has: page.locator('.og-title', { hasText: exact(key.optionGroups[gid].title) }) });
}
async function pick(page, gid, ids) {
  const g = key.optionGroups[gid];
  const sec = section(page, gid);
  if (g.type === 'quantity') {
    const counts = {};
    ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    for (const [id, n] of Object.entries(counts)) {
      const row = sec.locator('.qrow').filter({ has: page.locator('.ol', { hasText: exact(optOf(gid, id).label) }) });
      for (let i = 0; i < n; i++) await row.locator('button', { hasText: '+' }).click();
      const shown = await sec.locator('.qrow').filter({ has: page.locator('.ol', { hasText: exact(optOf(gid, id).label) }) }).locator('.q').innerText();
      if (Number(shown) !== n) throw new Error(`stepper ${gid}.${id} shows ${shown}, wanted ${n}`);
    }
    return;
  }
  for (const id of ids) {
    const label = optOf(gid, id).label;
    const el = () => section(page, gid).locator('.chip, .bigopt').filter({ has: page.locator('.ol, .bo-l', { hasText: exact(label) }) });
    await el().click();
    const cls = await el().getAttribute('class');
    if (!/\bon\b/.test(cls)) throw new Error(`option ${gid}.${id} (${label}) not selected after click`);
  }
}
async function cartLine(page, name) {
  return page.locator('.cart .ln').filter({ has: page.locator('.ln-name', { hasText: exact(name) }) }).last();
}

async function addLine(page, line, plan, oid) {
  const item = itemByName(line.item);
  const unit = unitFromKey(line);
  const isStepSet = item.optionGroups.includes('set_tteok');
  const qtyVia = isStepSet ? 'cart' : (plan.qtyVia || 'modal');
  const repeats = plan.mergeLine === item.name ? 2 : 1; // add the same config twice to exercise line merge
  for (let r = 0; r < repeats; r++) {
    await openCard(page, item);
    if (plan.requiredErrorFirst === item.name && r === 0) {
      await page.locator('.sh-foot .cta.add').click();
      const err = await page.locator('.sheet .err').innerText().catch(() => '');
      const firstReq = item.optionGroups.map((g) => key.optionGroups[g]).find((g) => g.required);
      check(err.includes('필수 옵션을 선택해 주세요') && err.includes(firstReq.title), `${oid}: missing required option blocks add -> "${err}"`);
    }
    for (const gid of item.optionGroups) {
      const ids = (line.options || {})[gid];
      if (isStepSet && !(await section(page, gid).isVisible())) {
        await page.locator('.sh-foot button', { hasText: exact('다음') }).click();
      }
      if (!ids || !ids.length) continue;
      await pick(page, gid, ids);
    }
    if (plan.toppingOverflow && item.optionGroups.includes('tteok_topping')) {
      await section(page, 'tteok_topping').locator('.chip').filter({ has: page.locator('.ol', { hasText: exact(plan.toppingOverflow) }) }).click();
      const err = await page.locator('.sheet .err').innerText().catch(() => '');
      const onCount = await section(page, 'tteok_topping').locator('.chip.on').count();
      check(err.includes('최대 3개') && onCount === 3, `${oid}: 4th topping rejected ("${err}", selected=${onCount})`);
    }
    let modalQty = 1;
    if (qtyVia === 'modal' && line.qty > 1 && repeats === 1) {
      for (let i = 1; i < line.qty; i++) await page.locator('.qty-wrap button', { hasText: '+' }).click();
      modalQty = line.qty;
    }
    const btn = isStepSet ? page.locator('.sh-foot button', { hasText: /세트 담기/ }) : page.locator('.sh-foot .cta.add');
    const btnText = await btn.innerText();
    check(num(btnText) === unit * modalQty, `${oid}: ${item.name} add button "${btnText.trim()}" == ${won(unit * modalQty)}`);
    await btn.click();
    if (await page.locator('.sheet').count()) throw new Error(`${oid}: modal still open after adding ${item.name}: ${await page.locator('.sheet .err').innerText().catch(() => '')}`);
  }
  const ln = await cartLine(page, item.name);
  let have = Number(await ln.locator('.q').innerText());
  if (repeats === 2) check(have === 2, `${oid}: same options added twice merged into one line (qty ${have})`);
  while (have < line.qty) { await ln.locator('button', { hasText: '+' }).click(); have += 1; }
  check(Number(await ln.locator('.q').innerText()) === line.qty, `${oid}: ${item.name} cart qty ${line.qty}`);
  const price = num(await ln.locator('.ln-price').innerText());
  check(price === unit * line.qty, `${oid}: ${item.name} cart line ${won(price)} == ${won(unit * line.qty)}`);
}

async function addPlain(page, name) {
  await openCard(page, itemByName(name));
  await page.locator('.sh-foot .cta.add').click();
}

async function runOrder(page, order) {
  const plan = PLAN[order.id] || {};
  const oid = order.id;
  await start(page, order.dine);
  const chip = await page.locator('.dine-chip').innerText();
  check(chip === (order.dine === '매장에서 먹어요' ? '매장 식사' : '포장 주문'), `${oid}: dine "${order.dine}" -> header "${chip}"`);

  if (plan.clearFirst) {
    await addPlain(page, plan.clearFirst);
    await page.locator('.cart .clear').click();
    const t = await page.locator('.pop-title').innerText();
    await page.locator('.pop button', { hasText: exact('모두 삭제') }).click();
    check(t.includes('장바구니를 모두 비울까요?') && (await page.locator('.cart .ln').count()) === 0, `${oid}: 전체 삭제 with confirmation empties cart`);
  }
  if (plan.decoyDelete) {
    await addPlain(page, plan.decoyDelete);
    const ln = await cartLine(page, plan.decoyDelete);
    await ln.locator('.del').click();
    const t = await page.locator('.pop-title').innerText();
    await page.locator('.pop button', { hasText: exact('취소') }).click();
    const still = await page.locator('.cart .ln').count();
    await (await cartLine(page, plan.decoyDelete)).locator('.del').click();
    await page.locator('.pop button', { hasText: exact('삭제') }).click();
    const after = await page.locator('.cart .ln').count();
    check(t.includes('선택한 메뉴를 삭제할까요?') && still === 1 && after === 0, `${oid}: delete asks "${t}", 취소 keeps line, 삭제 removes it`);
  }

  for (const line of order.lines) await addLine(page, line, plan, oid);

  const keyTotal = order.lines.reduce((a, l) => a + unitFromKey(l) * l.qty, 0);
  check(keyTotal === order.expectedTotal, `${oid}: key prices recompute to ${won(keyTotal)} == expectedTotal ${won(order.expectedTotal)}`);
  const cartSum = num(await page.locator('.cart .sum b').innerText());
  check(cartSum === order.expectedTotal, `${oid}: cart total ${won(cartSum)}`);

  await page.locator('button', { hasText: exact('주문 확인하기') }).click();
  const reviewTotal = num(await page.locator('.rs-total').innerText());
  check(reviewTotal === order.expectedTotal, `${oid}: review 총 결제 금액 ${won(reviewTotal)} == ${won(order.expectedTotal)}`);
  if (plan.expectDiscount) {
    const disc = await page.locator('.rs-row.disc span').last().innerText();
    check(disc === '-' + won(plan.expectDiscount), `${oid}: review 할인 금액 "${disc}"`);
  }

  await page.locator('button', { hasText: exact('주문하기') }).click();
  const popTitle = await page.locator('.pop-title').innerText();
  check(popTitle === '포인트 적립하시겠어요?', `${oid}: points popup after 주문하기 ("${popTitle}")`);
  if (plan.points) {
    await page.locator('.pop button', { hasText: exact('적립할게요') }).click();
    const digits = plan.points.split('');
    const tap = async (d) => page.locator('.pad .key', { hasText: exact(d) }).click();
    if (plan.phoneErrorFirst) {
      for (const d of digits.slice(0, 4)) await tap(d);
      await page.locator('.pop button', { hasText: exact('확인') }).click();
      const err = await page.locator('.pop .err').innerText().catch(() => '');
      check(err.includes('11자리'), `${oid}: short phone number rejected ("${err}")`);
      for (const d of digits.slice(4)) await tap(d);
    } else {
      for (const d of digits) await tap(d);
    }
    await page.locator('.pop button', { hasText: exact('확인') }).click();
  } else {
    await page.locator('.pop button', { hasText: exact('적립 안 할게요') }).click();
  }

  const title = await page.locator('.st-title').innerText();
  const payTotal = num(await page.locator('.pay-amount').innerText());
  check(title === '결제 수단 선택', `${oid}: reached payment-method screen`);
  check(payTotal === order.expectedTotal, `${oid}: payment screen 결제하실 금액 ${won(payTotal)} == expectedTotal ${won(order.expectedTotal)}`);
  if (plan.points) {
    const pt = await page.locator('.pay-pt').innerText();
    check(pt.includes(Math.floor(order.expectedTotal / 100) + 'P') && pt.includes(plan.points.slice(4)), `${oid}: points note "${pt}"`);
  }
  await page.locator('.method', { hasText: '신용/체크카드' }).click();
  const notice = await page.locator('.pay-notice').innerText();
  check(notice.includes('실제 결제는 진행되지 않습니다'), `${oid}: payment stops at method screen (no charge)`);
  await page.locator('button', { hasText: exact('주문 취소') }).click();
  await page.locator('.pop button', { hasText: exact('처음으로') }).click();
  check(await page.locator('.attract').isVisible(), `${oid}: 주문 취소 -> confirmation -> attract screen`);
  return { id: oid, expected: order.expectedTotal, review: reviewTotal, pay: payTotal };
}

/* ---------------- catalog check ---------------- */
async function catalogCheck(page) {
  await start(page, '매장에서 먹어요');
  const tabs = await page.locator('nav.tabs button').allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(key.categories.map((c) => c.label)), `catalog: category tabs ${tabs.join(', ')}`);
  for (const cat of key.categories) {
    await gotoCategory(page, cat.label);
    const cards = page.locator('.grid .card');
    const n = await cards.count();
    check(n === cat.itemCount, `catalog: ${cat.label} has ${n} items (key ${cat.itemCount})`);
    const keyItems = key.items.filter((i) => i.category === cat.label);
    for (let i = 0; i < n; i++) {
      const c = cards.nth(i);
      const name = (await c.locator('.nm').innerText()).trim();
      const ki = keyItems[i];
      const priceTxt = await c.locator('.pr').innerText();
      const prices = priceTxt.match(/[\d,]+원/g).map(num);
      const soldOut = (await c.locator('.so').count()) > 0;
      const okPrice = ki && prices[0] === ki.basePrice && (PROMO_PRICE[ki.name] == null ? prices.length === 1 : prices[1] === PROMO_PRICE[ki.name]);
      check(ki && ki.name === name && okPrice && soldOut === ki.soldOut, `catalog: ${cat.label} #${i + 1} "${name}" ${priceTxt.replace(/\n/g, ' ')}${soldOut ? ' [품절]' : ''}`);
      if (!ki || ki.soldOut) continue;
      // option groups in the popup
      await c.click();
      await page.locator('.sheet').waitFor();
      const isStepSet = ki.optionGroups.includes('set_tteok');
      const seen = [];
      for (const gid of ki.optionGroups) {
        const g = key.optionGroups[gid];
        if (isStepSet && !(await section(page, gid).isVisible())) await page.locator('.sh-foot button', { hasText: exact('다음') }).click();
        const sec = section(page, gid);
        const visible = await sec.isVisible();
        const req = visible ? (await sec.locator('.req').count()) > 0 : null;
        const opts = visible ? await sec.locator('.chip, .bigopt, .qrow').evaluateAll((els) => els.map((e) => {
          const l = e.querySelector('.ol, .bo-l').textContent.trim();
          const pEl = e.querySelector('.od, .bo-p');
          const p = pEl && /\d/.test(pEl.textContent) ? Number(pEl.textContent.replace(/[^0-9]/g, '')) : 0;
          return l + ':' + p;
        })) : [];
        const want = g.options.map((o) => o.label + ':' + o.priceDelta);
        const ok = visible && req === g.required && JSON.stringify(opts) === JSON.stringify(want);
        if (!ok) check(false, `catalog: ${ki.name} group "${g.title}" visible=${visible} required=${req} options=${opts.join(',')} (key ${want.join(',')})`);
        seen.push(g.title);
        if (isStepSet) await pick(page, gid, [g.options[0].id]);
      }
      const titles = await page.locator('.sheet .og-title').allInnerTexts();
      if (!isStepSet) check(JSON.stringify(titles) === JSON.stringify(seen), `catalog: ${ki.name} popup groups [${titles.join(', ')}]`);
      else check(true, `catalog: ${ki.name} step popup groups [${seen.join(' → ')}]`);
      await page.locator('.sheet .x').click();
    }
  }
  // sold-out tap and empty-cart error
  await gotoCategory(page, '김밥');
  await page.locator('.card').filter({ has: page.locator('.nm', { hasText: exact('멸치 김밥') }) }).click();
  const toast = await page.locator('#toast').innerText();
  check((await page.locator('.sheet').count()) === 0 && toast.includes('품절'), `ui: sold-out card does not open ("${toast}")`);
  await page.locator('button', { hasText: exact('주문 확인하기') }).click();
  const t = await page.locator('.pop-title').innerText();
  check(t === '장바구니가 비어 있어요', `ui: empty cart error popup ("${t}")`);
  await page.locator('.pop button', { hasText: exact('확인') }).click();
  // banner opens the discounted item
  await page.locator('.promo-banner').click();
  const nm = await page.locator('.sheet .sh-name').innerText();
  check(nm === '로제 떡볶이', `ui: 오늘의 할인 banner opens "${nm}"`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.setDefaultTimeout(5000);

  const results = [];
  try {
    await catalogCheck(page);
  } catch (e) { check(false, 'catalog check crashed: ' + e.message.split('\n')[0]); }
  for (const order of key.holdoutOrders) {
    try { results.push(await runOrder(page, order)); }
    catch (e) { check(false, `${order.id}: crashed: ${e.message.split('\n')[0]}`); results.push({ id: order.id, expected: order.expectedTotal, review: null, pay: null }); }
  }
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();

  const table = results.map((r) => `${r.id.padEnd(4)} expected ${won(r.expected).padStart(8)}  review ${r.review == null ? '-' : won(r.review).padStart(8)}  payment ${r.pay == null ? '-' : won(r.pay).padStart(8)}  ${r.pay === r.expected && r.review === r.expected ? 'OK' : 'MISMATCH'}`);
  const passCount = log.filter((l) => l.startsWith('PASS')).length;
  const okOrders = results.filter((r) => r.pay === r.expected && r.review === r.expected).length;
  const out = [
    'bk9-bunsik self-check',
    'app: app/index.html (file://, 720x1280, headless Chromium via Playwright)',
    'store clock (fixed): ' + '10.14 (수) 12:30',
    '',
    `HOLDOUT ORDERS: ${okOrders}/${results.length} totals match on review and payment screens`,
    ...table,
    '',
    `CHECKS: ${passCount} passed, ${failures} failed`,
    ...log,
    '',
    failures === 0 ? 'RESULT: PASS' : 'RESULT: FAIL'
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, 'RESULT.txt'), out);
  console.log(out);
  process.exit(failures === 0 ? 0 : 1);
})();
