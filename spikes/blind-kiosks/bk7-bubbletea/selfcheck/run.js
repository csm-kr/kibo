// Self-check for bk7-bubbletea.
// 1) Cross-checks answer-key.json against the app's menu data (app/menu.js).
// 2) Recomputes every holdout total from the answer key alone.
// 3) Places all 10 holdout orders in the real app (Playwright, file:// URL) by
//    tapping visible labels, and compares the review total and the payment-screen
//    amount with expectedTotal. Also exercises errors, popups and confirmations.
// Writes selfcheck/RESULT.txt.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'app/index.html');
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, 'answer-key.json'), 'utf8'));
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'app/menu.js'), 'utf8'), ctx);
const MENU = ctx.window.MENU;

const out = [];
let failures = 0;
function log(s) { out.push(s); console.log(s); }
function check(cond, msg) { if (!cond) { failures++; log('  FAIL ' + msg); } else log('  ok   ' + msg); }
const won = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
const parseWon = s => parseInt(String(s).replace(/[^\d-]/g, ''), 10);

/* ---------- 1. answer key vs app data ---------- */
function crossCheck() {
  log('[1] answer key vs app/menu.js');
  check(KEY.items.length === MENU.items.length, `item count ${KEY.items.length} == ${MENU.items.length}`);
  KEY.categories.forEach(c => {
    const mc = MENU.cats.find(x => x.ko === c.label);
    const n = MENU.items.filter(i => mc && i.cat === mc.id).length;
    check(mc && n === c.itemCount, `category ${c.label} has ${c.itemCount} items`);
  });
  let bad = [];
  KEY.items.forEach(ki => {
    const mi = MENU.items.find(i => i.ko === ki.name);
    if (!mi) { bad.push(ki.name + ' missing'); return; }
    const cat = MENU.cats.find(c => c.id === mi.cat).ko;
    if (mi.price !== ki.basePrice) bad.push(ki.name + ' price');
    if (!!mi.soldOut !== ki.soldOut) bad.push(ki.name + ' soldOut');
    if (cat !== ki.category) bad.push(ki.name + ' category');
    if (mi.en !== ki.nameEn) bad.push(ki.name + ' nameEn');
    const keyGroups = ki.optionGroups.filter(g => g !== 'setChoice' && g !== 'setSnack');
    if (keyGroups.join() !== mi.g.join()) bad.push(ki.name + ' groups');
    const drink = mi.cat !== 'snack';
    if (drink !== ki.optionGroups.includes('setChoice')) bad.push(ki.name + ' set groups');
    if ((mi.only || undefined) !== ki.fixedTemp) bad.push(ki.name + ' fixedTemp');
  });
  Object.keys(MENU.groups).forEach(gid => {
    const mg = MENU.groups[gid], kg = KEY.optionGroups[gid];
    if (!kg) { bad.push('group ' + gid + ' missing'); return; }
    if (kg.default !== mg.def || kg.required !== mg.required || kg.type !== mg.type) bad.push('group ' + gid + ' meta');
    mg.opts.forEach(o => {
      const ko = kg.options.find(x => x.id === o.id);
      if (!ko || ko.priceDelta !== o.p || ko.label !== o.ko || !!ko.soldOut !== !!o.soldOut) bad.push('option ' + gid + '.' + o.id);
    });
    if (kg.options.length !== mg.opts.length) bad.push('group ' + gid + ' option count');
  });
  const ss = KEY.optionGroups.setSnack.options;
  MENU.setSnacks.forEach(id => {
    const it = MENU.items.find(i => i.id === id), ko = ss.find(o => o.id === id);
    if (!ko || ko.priceDelta !== it.price || ko.label !== it.ko || !!ko.soldOut !== !!it.soldOut) bad.push('setSnack ' + id);
  });
  check(KEY.optionGroups.setChoice.options.find(o => o.id === 'set').priceDelta === -MENU.setDiscount, 'set discount matches');
  check(KEY.takeoutFee.perDrinkCup === MENU.takeoutCupFee, 'take-out cup fee matches');
  check(bad.length === 0, 'items/groups/options match' + (bad.length ? ': ' + bad.join(', ') : ''));
}

/* ---------- 2. totals from the answer key alone ---------- */
function keyLine(l) {
  const it = KEY.items.find(i => i.name === l.item);
  let unit = it.basePrice;
  const problems = [];
  Object.entries(l.options).forEach(([gid, ids]) => {
    if (!it.optionGroups.includes(gid)) problems.push(gid + ' not on item');
    const g = KEY.optionGroups[gid];
    if (ids.length > g.max) problems.push(gid + ' over max');
    ids.forEach(id => {
      const o = g.options.find(x => x.id === id);
      if (!o) problems.push(gid + '.' + id + ' unknown');
      else { if (o.soldOut) problems.push(gid + '.' + id + ' sold out'); unit += o.priceDelta; }
    });
  });
  // required groups present (respecting conditions)
  it.optionGroups.forEach(gid => {
    const g = KEY.optionGroups[gid];
    if (!g.required) return;
    if (gid === 'ice' && (l.options.temp || [])[0] === 'hot') { if (l.options.ice) problems.push('ice given for hot'); return; }
    if (gid === 'setSnack' && (l.options.setChoice || [])[0] !== 'set') return;
    if (!l.options[gid]) problems.push(gid + ' missing');
  });
  if (it.soldOut) problems.push('item sold out');
  return { unit, total: unit * l.qty, drink: it.category !== '스낵', problems };
}
function keyTotal(h, orderType) {
  let sum = 0, cups = 0;
  h.lines.forEach(l => { const k = keyLine(l); sum += k.total; if (k.drink) cups += l.qty; });
  if ((orderType || h.orderType) === 'takeOut') sum += cups * KEY.takeoutFee.perDrinkCup;
  return sum;
}
function recompute() {
  log('[2] holdout totals recomputed from the answer key');
  KEY.holdoutOrders.forEach(h => {
    const probs = [].concat(...h.lines.map(l => keyLine(l).problems));
    const t = keyTotal(h);
    check(t === h.expectedTotal && !probs.length, `${h.id} ${won(t)} == expected ${won(h.expectedTotal)}` + (probs.length ? ' problems: ' + probs.join(', ') : ''));
  });
}

/* ---------- 3. drive the app ---------- */
const lbl = (lang, o) => (lang === 'en' ? o.en : o.ko);
const mItem = name => MENU.items.find(i => i.ko === name);
const mOpt = (gid, id) => MENU.groups[gid].opts.find(o => o.id === id);

async function idxOf(page, sel, text, sub) {
  return page.evaluate(([sel, text, sub]) => {
    const els = Array.from(document.querySelectorAll(sel));
    return els.findIndex(e => {
      const n = sub ? e.querySelector(sub) : e;
      if (!n) return false;
      const t = sub ? n.firstChild.textContent : n.textContent;
      return t.trim() === text;
    });
  }, [sel, text, sub || null]);
}
async function tap(page, sel, text, sub) {
  const i = await idxOf(page, sel, text, sub);
  if (i < 0) throw new Error(`not found: ${sel} "${text}"`);
  await page.locator(sel).nth(i).click();
}
async function groupIndex(page, title) {
  return page.evaluate(t => Array.from(document.querySelectorAll('.og')).findIndex(o => {
    const n = o.querySelector('.ogn'); return n && n.textContent === t;
  }), title);
}
async function chooseChip(page, title, label) {
  const gi = await groupIndex(page, title);
  if (gi < 0) throw new Error('group not shown: ' + title);
  const ci = await page.evaluate(([gi, l]) => Array.from(document.querySelectorAll('.og')[gi].querySelectorAll('.chip'))
    .findIndex(c => c.querySelector('.ol').textContent === l), [gi, label]);
  if (ci < 0) throw new Error('chip not found: ' + title + ' / ' + label);
  await page.locator('.og').nth(gi).locator('.chip').nth(ci).click();
}
async function stepperPlus(page, title, times) {
  const gi = await groupIndex(page, title);
  for (let i = 0; i < times; i++) await page.locator('.og').nth(gi).locator('.qb').nth(1).click();
}
async function cartLineIndex(page, name) { return idxOf(page, '.line', name, '.lname'); }

async function addLine(page, h, l, cfg, ix) {
  const lang = h.language, it = mItem(l.item);
  const cat = MENU.cats.find(c => c.id === it.cat);
  await tap(page, '.tab', lbl(lang, cat));
  await tap(page, '.card', lbl(lang, it), '.cname');
  await page.locator('.sheet.opt').waitFor();
  if (cfg.beforeOptions && ix === 0) await cfg.beforeOptions(page);
  for (const gid of it.g) {
    const ids = l.options[gid];
    if (!ids) continue;
    const g = MENU.groups[gid];
    if (g.type === 'quantity') await stepperPlus(page, lbl(lang, g), ids.length);
    else for (const id of ids) await chooseChip(page, lbl(lang, g), lbl(lang, mOpt(gid, id)));
    if (cfg.afterGroup) await cfg.afterGroup(page, gid, it);
  }
  const k = keyLine(l);
  const modalQty = cfg.cartQty ? 1 : l.qty;
  for (let i = 1; i < modalQty; i++) await page.locator('.og.qty .qb').nth(1).click();
  const drinkOnly = (k.unit - (l.options.setChoice && l.options.setChoice[0] === 'set'
    ? KEY.optionGroups.setSnack.options.find(o => o.id === l.options.setSnack[0]).priceDelta - MENU.setDiscount : 0)) * modalQty;
  const btn = await page.locator('.sheet.opt .ofoot .primary').textContent();
  check(parseWon(btn) === drinkOnly, `${h.id} option button shows ${won(drinkOnly)} for ${l.item} ("${btn}")`);
  await page.locator('.sheet.opt .ofoot .primary').click();
  if (it.cat !== 'snack') {
    await page.locator('.sheet.setm').waitFor();
    if (l.options.setChoice[0] === 'set') {
      await page.locator('.setc.hl').click();
      if (cfg.setNoSnackError) {
        await page.locator('.sheet.setm .ofoot .primary').click();
        check((await page.locator('.sheet.setm .oerr').count()) === 1, `${h.id} set step 2 without snack shows error`);
      }
      const snack = mItem(MENU.items.find(i => i.id === l.options.setSnack[0]).ko);
      await tap(page, '.snk', lbl(lang, snack), '.skn');
      await page.locator('.sheet.setm .ofoot .primary').click();
      const st = parseWon(await page.locator('.srow.stot span').textContent());
      check(st === k.unit * modalQty, `${h.id} set step 3 shows set price ${won(k.unit * modalQty)}`);
      await page.locator('.sheet.setm .ofoot .primary').click();
    } else {
      await page.locator('.setc:not(.hl)').click();
    }
  }
  if (await page.locator('.sheet.stamp').count()) {
    if (cfg.stampPhone) await cfg.stampPhone(page);
    else await page.locator('.sheet.stamp .ofoot .btn.ghost').click();
    check(true, `${h.id} stamp popup appeared after first add and was dismissed`);
  }
  check((await page.locator('.overlay').count()) === 0, `${h.id} no popup left after adding ${l.item}`);
  if (cfg.cartQty && l.qty > 1) {
    const li = await cartLineIndex(page, lbl(lang, it));
    for (let i = 1; i < l.qty; i++) await page.locator('.line').nth(li).locator('.qb').nth(1).click();
    const qn = await page.locator('.line').nth(li).locator('.qn').textContent();
    check(Number(qn) === l.qty, `${h.id} cart + raised ${l.item} to ${l.qty}`);
  }
}

const scenario = {
  h1: {
    beforeOptions: async page => {
      await page.locator('.sheet.opt .ofoot .primary').click();
      const e = await page.locator('.oerr').textContent();
      check(/필수 옵션을 선택해 주세요/.test(e) && /얼음량/.test(e), `h1 담기 before required choices shows "${e.trim()}"`);
    }
  },
  h2: {
    afterGroup: async (page, gid) => {
      if (gid === 'temp') check((await groupIndex(page, '얼음량')) < 0, 'h2 HOT hides the 얼음량 group');
    }
  },
  h3: {
    afterGroup: async (page, gid) => {
      if (gid !== 'topping') return;
      await chooseChip(page, '토핑', '밀크폼');
      const e = await page.locator('.oerr').textContent();
      check(/최대 3개/.test(e), `h3 4th topping rejected: "${e.trim()}"`);
      const gi = await groupIndex(page, '토핑');
      const dis = await page.locator('.og').nth(gi).locator('.chip:disabled').count();
      check(dis === 2, 'h3 two sold-out toppings are disabled');
    }
  },
  h4: {
    stampPhone: async page => {
      await page.locator('.sheet.stamp .ofoot .primary').click();
      await page.locator('.sheet.stamp .ofoot .primary').click();
      check((await page.locator('.sheet.stamp .oerr').count()) === 1, 'h4 empty phone number shows error');
      for (const d of '12345678') await tap(page, '.key', d);
      await page.locator('.sheet.stamp .ofoot .primary').click();
      await page.locator('.sheet.small .ofoot .primary').click();
    },
    onReview: async page => {
      const n = await page.locator('.stampnote').textContent();
      check(/010-\*\*\*\*-5678/.test(n), 'h4 review shows masked stamp number');
    }
  },
  h5: {
    afterGroup: async (page, gid) => {
      if (gid === 'temp') check((await groupIndex(page, '얼음량')) < 0, 'h5 HOT hides the 얼음량 group on coffee');
    },
    setNoSnackError: true
  },
  h6: {
    onReview: async page => {
      const t = await page.locator('.rrow.grand span').first().textContent();
      check(t === 'Total payment', 'h6 review is in English');
    }
  },
  h7: { cartQty: true },
  h8: {
    afterGroup: async (page, gid, it) => {
      if (it.id === 'sweetPotatoMilk' && gid === 'size') {
        check((await groupIndex(page, '온도')) < 0 && (await groupIndex(page, '얼음량')) < 0, 'h8 HOT ONLY item has no 온도/얼음량 groups');
      }
    }
  },
  h9: {},
  h10: {
    startType: 'eatIn',
    afterLines: async page => {
      // add an extra drink, then delete it with the confirmation dialog
      await tap(page, '.tab', '밀크티');
      await tap(page, '.card', '클래식 밀크티', '.cname');
      await chooseChip(page, '얼음량', '얼음 보통');
      await chooseChip(page, '당도', '50%');
      await page.locator('.sheet.opt .ofoot .primary').click();
      await page.locator('.setc:not(.hl)').click();
      const before = await page.locator('.line').count();
      let li = await cartLineIndex(page, '클래식 밀크티');
      await page.locator('.line').nth(li).locator('.ldel').click();
      const msg = await page.locator('.sheet.small .cmsg').textContent();
      check(/삭제하시겠습니까/.test(msg), `h10 delete asks "${msg.trim()}"`);
      await page.locator('.sheet.small .ofoot .ghost').click();
      check((await page.locator('.line').count()) === before, 'h10 cancel keeps the line');
      li = await cartLineIndex(page, '클래식 밀크티');
      await page.locator('.line').nth(li).locator('.ldel').click();
      await page.locator('.sheet.small .ofoot .danger').click();
      check((await page.locator('.line').count()) === before - 1, 'h10 confirm removes the line');
    },
    switchType: 'takeOut'
  }
};

async function runHoldout(browser, h) {
  const cfg = scenario[h.id] || {};
  log(`[3] ${h.id} (${h.orderType}, ${h.language}) — ${h.lines.map(l => l.item + ' x' + l.qty).join(', ')}`);
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(APP);
  if (h.language === 'en') await page.locator('.lang', { hasText: 'English' }).click();
  await page.locator('.attract .touch').click();
  const startType = cfg.startType || h.orderType;
  await page.locator(startType === 'takeOut' ? '.typecard.take' : '.typecard.eat').click();
  for (let i = 0; i < h.lines.length; i++) await addLine(page, h, h.lines[i], cfg, i);
  if (cfg.afterLines) await cfg.afterLines(page);
  const cartTotal = parseWon(await page.locator('.tamt').textContent());
  const expCart = keyTotal(h, startType);
  check(cartTotal === expCart, `${h.id} cart 합계 ${won(cartTotal)} == ${won(expCart)}`);
  await page.locator('.orderbtn').click();
  if (cfg.switchType) {
    await page.locator('.seg button').nth(cfg.switchType === 'takeOut' ? 1 : 0).click();
    check((await page.locator('.rrow', { hasText: '포장컵 비용' }).count()) === 1, `${h.id} switching to 포장 on review adds the cup-fee line`);
  }
  if (cfg.onReview) await cfg.onReview(page);
  const review = parseWon(await page.locator('.gamt').textContent());
  await page.locator('.foot .primary').click();
  const pay = parseWon(await page.locator('.pamt').textContent());
  await page.locator('.method').first().click();
  await page.locator('.payguide').waitFor();
  check(review === h.expectedTotal, `${h.id} review 총 결제 금액 ${won(review)} == expected ${won(h.expectedTotal)}`);
  check(pay === h.expectedTotal, `${h.id} payment screen 결제하실 금액 ${won(pay)} == expected ${won(h.expectedTotal)}`);
  check(errors.length === 0, `${h.id} no page errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.close();
  return review === h.expectedTotal && pay === h.expectedTotal;
}

async function misc(browser) {
  log('[4] misc popups and errors');
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page.goto(APP);
  await page.locator('.attract .touch').click();
  await page.locator('.typecard.eat').click();
  await page.locator('.orderbtn').click();
  check(/장바구니가 비어 있습니다/.test(await page.locator('.sheet.small .cmsg').textContent()), 'empty-cart 주문하기 shows error popup');
  await page.locator('.sheet.small .ofoot .btn').click();
  await tap(page, '.tab', '스낵');
  await tap(page, '.card', '에그타르트', '.cname');
  check(/품절된 메뉴입니다/.test(await page.locator('.sheet.small .cmsg').textContent()), 'sold-out item shows 품절 popup');
  await page.locator('.sheet.small .ofoot .btn').click();
  await page.locator('.homebtn').click();
  check((await page.locator('.attract').count()) === 1, '처음으로 with empty cart returns to attract');
  await page.close();
}

(async () => {
  log('bk7-bubbletea self-check  ' + new Date().toISOString());
  log('app: ' + APP);
  crossCheck();
  recompute();
  const browser = await chromium.launch();
  const placed = [];
  for (const h of KEY.holdoutOrders) {
    try { if (await runHoldout(browser, h)) placed.push(h.id); }
    catch (e) { failures++; log(`  FAIL ${h.id} threw: ${e.message.split('\n')[0]}`); }
  }
  try { await misc(browser); } catch (e) { failures++; log('  FAIL misc threw: ' + e.message.split('\n')[0]); }
  await browser.close();
  log('');
  log(`holdouts placed in the app with matching totals: ${placed.length}/${KEY.holdoutOrders.length} (${placed.join(', ')})`);
  log(failures === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${failures} failed checks)`);
  fs.writeFileSync(path.join(__dirname, 'RESULT.txt'), out.join('\n') + '\n');
  process.exit(failures ? 1 : 0);
})();
