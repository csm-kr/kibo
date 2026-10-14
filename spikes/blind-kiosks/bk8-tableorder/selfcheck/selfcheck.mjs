// Self-check for bk8-tableorder.
// 1) answer-key.json matches the app's menu data (names, prices, groups, counts).
// 2) Places holdout orders through the UI with Playwright and compares the
//    table total on the order-sent screen with answer-key.json.
// 3) Exercises the error / popup / confirmation paths.
// Usage: node selfcheck/selfcheck.mjs   (writes selfcheck/RESULT.txt)
import { chromium } from '/Users/sungmincho_mac/Desktop/sm/apps/kibo/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const url = pathToFileURL(path.join(root, 'app', 'index.html')).href;
const key = JSON.parse(fs.readFileSync(path.join(root, 'answer-key.json'), 'utf8'));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'app', 'data.js'), 'utf8'), sandbox);
const D = sandbox.window.KIOSK_DATA;

const LANG = { '한국어': 'ko', English: 'en', '日本語': 'ja', '中文': 'zh' };
const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
const byKo = Object.fromEntries(D.items.map((i) => [i.name.ko, i]));
const catOf = (it) => D.categories.find((c) => c.id === it.cat);

const out = [];
let failures = 0;
function check(ok, label, detail = '') {
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

/* ---------- 1. answer key vs app data ---------- */
function keyConsistency() {
  out.push('== answer key vs app data ==');
  check(D.items.length === key.items.length, 'item count', `app ${D.items.length}, key ${key.items.length}`);
  check(D.categories.length === key.categories.length, 'category count', `app ${D.categories.length}, key ${key.categories.length}`);
  for (const c of key.categories) {
    const dc = D.categories.find((x) => x.name.ko === c.label);
    const n = dc ? D.items.filter((i) => i.cat === dc.id).length : -1;
    check(n === c.itemCount, `category ${c.label}`, `app ${n}, key ${c.itemCount}`);
  }
  let bad = [];
  for (const ki of key.items) {
    const it = byKo[ki.name];
    if (!it) { bad.push(`${ki.name} missing`); continue; }
    if (it.price !== ki.basePrice) bad.push(`${ki.name} price`);
    if (!!it.soldOut !== ki.soldOut) bad.push(`${ki.name} soldOut`);
    if (catOf(it).name.ko !== ki.category) bad.push(`${ki.name} category`);
    if (JSON.stringify(it.groups) !== JSON.stringify(ki.optionGroups)) bad.push(`${ki.name} groups`);
    if (!!it.alcohol !== !!ki.alcohol) bad.push(`${ki.name} alcohol`);
    if (!!it.meat !== !!ki.meat) bad.push(`${ki.name} meat`);
  }
  check(bad.length === 0, 'items (name, price, soldOut, category, groups, alcohol, meat)', bad.join('; '));
  bad = [];
  for (const [gid, g] of Object.entries(key.optionGroups)) {
    const dg = D.groups[gid];
    if (!dg) { bad.push(`${gid} missing`); continue; }
    if (dg.title.ko !== g.title || dg.type !== g.type || dg.required !== g.required || dg.min !== g.min || dg.max !== g.max) bad.push(`${gid} header`);
    g.options.forEach((o, i) => {
      const d = dg.options[i];
      if (!d || d.id !== o.id || d.name.ko !== o.label || d.price !== o.priceDelta) bad.push(`${gid}.${o.id}`);
    });
    if (dg.options.length !== g.options.length) bad.push(`${gid} option count`);
  }
  check(bad.length === 0, 'option groups', bad.join('; '));
  // recompute every holdout total from the data
  const totals = {};
  for (const h of key.holdoutOrders) {
    let sum = 0;
    for (const l of h.lines) {
      const it = byKo[l.item];
      let unit = it.price;
      for (const [gid, ids] of Object.entries(l.options)) for (const id of ids) unit += D.groups[gid].options.find((o) => o.id === id).price;
      sum += unit * l.qty;
    }
    totals[h.id] = sum;
    const before = (h.startsAfter || []).reduce((a, id) => a + totals[id], 0);
    check(sum === h.orderTotal && before + sum === h.expectedTotal, `${h.id} arithmetic`, `order ${won(sum)}, table ${won(before + sum)}`);
  }
}

/* ---------- UI helpers ---------- */
async function ownTextIndex(page, selector, text) {
  return page.$$eval(selector, (els, t) => els.findIndex((e) => {
    const first = [...e.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    return (first ? first.textContent : e.textContent).trim() === t;
  }), text);
}
async function clickOwnText(page, selector, text) {
  const i = await ownTextIndex(page, selector, text);
  if (i < 0) throw new Error(`not found: ${selector} "${text}"`);
  await page.locator(selector).nth(i).click();
}
const visible = async (page, sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();
const cartTotal = (page) => page.locator('#cart .c-sum strong').innerText();
const cartCount = async (page) => Number(await page.locator('#cart .cnt').innerText());

async function setLang(page, code) {
  await page.locator('#menu .hbtn.lang').click();
  await clickOwnText(page, '.lang-opt', D.text[code].langName);
}

async function addLine(page, line, lang) {
  const L = (o) => o[lang];
  const it = byKo[line.item];
  await clickOwnText(page, '.cat', L(catOf(it).name));
  if (it.meat || it.groups.length) {
    await clickOwnText(page, '.card .nm', L(it.name));
    for (let gi = 0; gi < it.groups.length; gi++) {
      const gid = it.groups[gi];
      for (const oid of line.options[gid] || []) {
        const label = L(D.groups[gid].options.find((o) => o.id === oid).name);
        const grp = page.locator('.m-item .grp').nth(gi);
        const idx = await grp.locator('.opt .o-l').evaluateAll((els, t) => els.findIndex((e) => e.textContent.trim() === t), label);
        if (idx < 0) throw new Error(`option not found ${label}`);
        await grp.locator('.opt').nth(idx).click();
      }
    }
    for (let q = 1; q < line.qty; q++) await page.locator('.m-item .qty-row .st-btn').nth(1).click();
    await page.locator('.m-item .mi-foot .btn.primary').click();
    if (await visible(page, '.m-item')) {
      throw new Error(`popup did not close for ${line.item}: ${await page.locator('.m-item .err').innerText()}`);
    }
  } else {
    for (let q = 0; q < line.qty; q++) {
      await clickOwnText(page, '.card .nm', L(it.name));
      if (await visible(page, '.m-dlg .dlg-ic.age')) await page.locator('.m-dlg .btn.primary').click();
    }
  }
}

async function staffCall(page, labels, lang) {
  const before = await cartTotal(page);
  await page.locator('#menu .hbtn.call').click();
  for (const ko of labels) {
    const s = D.staffCall.find((x) => x.name.ko === ko);
    const idx = await page.locator('.chip').evaluateAll((els, t) => els.findIndex((e) => e.lastChild.textContent.trim() === t), s.name[lang]);
    await page.locator('.chip').nth(idx).click();
  }
  await page.locator('.m-staff .btn.primary').click();
  const toast = await page.locator('#toast').innerText();
  const after = await cartTotal(page);
  return { toast, before, after };
}

async function placeHoldout(page, h, opts = {}) {
  for (const prev of h.startsAfter || []) {
    await placeHoldout(page, key.holdoutOrders.find((x) => x.id === prev), { nested: true });
    await page.locator('.s-btns .btn.primary').click(); // 추가 주문하기
  }
  const lang = h.language ? LANG[h.language] : 'ko';
  if (lang !== 'ko') await setLang(page, lang);
  for (const line of h.lines) await addLine(page, line, lang);
  if (h.staffCall) {
    const r = await staffCall(page, h.staffCall, lang);
    check(r.before === r.after && /직원을 호출했습니다/.test(r.toast), `${h.id} staff call is free`, `toast "${r.toast}", cart ${r.before} -> ${r.after}`);
  }
  const reviewTotal = await (async () => {
    await page.locator('#cart .btn.order').click();
    return page.locator('.m-review .mr-sum strong').innerText();
  })();
  await page.locator('.m-review .mi-foot .btn.primary').click();
  const thisOrder = await page.locator('#sent .s-row:not(.big) b').innerText();
  const table = await page.locator('#sent .s-row.big b').innerText();
  if (!opts.nested) {
    check(reviewTotal === won(h.orderTotal) && thisOrder === won(h.orderTotal) && table === won(h.expectedTotal),
      `${h.id} placed via UI${h.language ? ' (' + h.language + ')' : ''}${h.startsAfter ? ' after ' + h.startsAfter.join(',') : ''}`,
      `review ${reviewTotal}, this order ${thisOrder}, table total ${table}; key ${won(h.orderTotal)} / ${won(h.expectedTotal)}`);
    // history shows the same running total and one block per sent order
    await page.locator('#sent .s-btns .btn.ghost').click();
    const histTotal = await page.locator('.m-hist .mr-sum strong').innerText();
    const blocks = await page.locator('.m-hist .mh-ord').count();
    const histText = await page.locator('.m-hist').innerText();
    const staffLeak = h.staffCall ? h.staffCall.some((s) => histText.includes(s)) : false;
    check(histTotal === won(h.expectedTotal) && blocks === 1 + (h.startsAfter || []).length && !staffLeak,
      `${h.id} history`, `total ${histTotal}, orders ${blocks}${h.staffCall ? ', staff items in history: ' + staffLeak : ''}`);
    await page.locator('.m-hist .btn.primary').click();
  }
}

/* ---------- 3. error / popup paths ---------- */
async function negativePaths(page) {
  out.push('== popups, confirmations and errors ==');
  await page.goto(url);
  await page.locator('#attract').click();
  // first meat order: 1인분 is rejected
  await clickOwnText(page, '.card .nm', '생삼겹살');
  await page.locator('.m-item .mi-foot .btn.primary').click();
  const err1 = await page.locator('.m-item .err').innerText();
  check(err1 === '첫 고기 주문은 2인분 이상부터 가능합니다' && (await cartCount(page)) === 0, 'first meat 1인분 shows error, nothing added', err1);
  await page.locator('.m-item .qty-row .st-btn').nth(1).click();
  await page.locator('.m-item .mi-foot .btn.primary').click();
  check((await cartTotal(page)) === '32,000원', 'meat 2인분 accepted', await cartTotal(page));
  // reduce to 1인분 in the list, then 주문하기 → notice popup
  await page.locator('#cart .c-line .st-btn').first().click();
  await page.locator('#cart .btn.order').click();
  const notice = await page.locator('.m-dlg').innerText();
  check(notice.includes('첫 고기 주문은 2인분 이상부터 가능합니다') && !(await visible(page, '.m-review')), 'list reduced to 1인분 blocks 주문하기 with notice', notice.replace(/\n+/g, ' / '));
  await page.locator('.m-dlg .btn.primary').click();
  // clear-all confirmation
  await page.locator('#cart .c-clear').click();
  const conf = await page.locator('.m-dlg').innerText();
  await page.locator('.m-dlg .btn.primary').click();
  check(conf.includes('담은 메뉴를 모두 삭제할까요?') && (await cartCount(page)) === 0, '전체 삭제 asks for confirmation and empties the list');
  // empty order
  await page.locator('#cart .btn.order').click();
  check((await page.locator('#toast').innerText()) === '담은 메뉴가 없습니다', 'empty 주문하기 shows error toast');
  // sold out
  await clickOwnText(page, '.card .nm', '차돌박이');
  check((await page.locator('#toast').innerText()) === '품절된 메뉴입니다' && (await cartCount(page)) === 0 && !(await visible(page, '.m-item')), 'sold-out item cannot be added');
  // noodle required choice
  await clickOwnText(page, '.cat', '식사·면');
  await clickOwnText(page, '.card .nm', '냉면');
  await page.locator('.m-item .mi-foot .btn.primary').click();
  check((await page.locator('.m-item .err').innerText()) === '필수 옵션을 선택해 주세요: 물/비빔 선택', 'noodle without 물/비빔 shows required error');
  await page.locator('.m-item .mi-foot .btn.ghost').click();
  // stew: spice required, add-ins max 2
  await clickOwnText(page, '.cat', '찌개');
  await clickOwnText(page, '.card .nm', '김치찌개');
  const addins = page.locator('.m-item .grp').nth(1).locator('.opt');
  await addins.nth(0).click(); await addins.nth(1).click(); await addins.nth(2).click();
  const maxErr = await page.locator('.m-item .err').innerText();
  const onCount = await page.locator('.m-item .grp').nth(1).locator('.opt.on').count();
  check(maxErr === '최대 2개까지 선택할 수 있습니다' && onCount === 2, 'third add-in rejected (max 2)', `${maxErr}, selected ${onCount}`);
  await page.locator('.m-item .mi-foot .btn.primary').click();
  check((await page.locator('.m-item .err').innerText()) === '필수 옵션을 선택해 주세요: 맵기 선택', 'stew without spice shows required error');
  await page.locator('.m-item .x').click();
  // alcohol: 아니오
  await clickOwnText(page, '.cat', '주류·음료');
  await clickOwnText(page, '.card .nm', '소주');
  const age = await page.locator('.m-dlg').innerText();
  await page.locator('.m-dlg .btn.ghost').click();
  const denied = await page.locator('.m-dlg').innerText();
  await page.locator('.m-dlg .btn.primary').click();
  check(age.includes('만 19세 이상이십니까?') && denied.includes('만 19세 미만은 주류를 주문할 수 없습니다') && (await cartCount(page)) === 0, 'alcohol 아니오 adds nothing', denied.replace(/\n+/g, ' / '));
  // alcohol: asked again, 예 adds; next alcohol is not asked again
  await clickOwnText(page, '.card .nm', '소주');
  const askedAgain = await visible(page, '.m-dlg .dlg-ic.age');
  await page.locator('.m-dlg .btn.primary').click();
  await clickOwnText(page, '.card .nm', '막걸리');
  const askedThird = await visible(page, '.m-dlg .dlg-ic.age');
  check(askedAgain && !askedThird && (await cartTotal(page)) === '11,000원', 'alcohol 예 adds; remembered for the session', await cartTotal(page));
  // staff call: nothing selected → error; selection → toast only
  await page.locator('#menu .hbtn.call').click();
  await page.locator('.m-staff .btn.primary').click();
  const sErr = await page.locator('.m-staff .err').innerText();
  check(sErr === '요청할 항목을 선택해 주세요', 'staff call without selection shows error', sErr);
  await page.locator('.m-staff .x').click();
  // language: labels change, prices stay
  await setLang(page, 'en');
  await clickOwnText(page, '.cat', 'Meat');
  const enCard = await page.locator('.card').first().innerText();
  const enCart = await page.locator('#cart').innerText();
  await setLang(page, 'zh');
  const zhCard = await page.locator('.card').first().innerText();
  check(enCard.includes('Fresh Pork Belly') && enCard.includes('16,000원') && zhCard.includes('鲜五花肉') && zhCard.includes('16,000원') && enCart.includes('Soju') && enCart.includes('11,000원'),
    'language switch changes labels, keeps "16,000원" and the list', `${enCard.replace(/\n+/g, ' ')} | ${zhCard.replace(/\n+/g, ' ')}`);
  // attract screen language + staff call buttons do not start the order
  await page.goto(url);
  await page.locator('#attract .hbtn.lang').click();
  await clickOwnText(page, '.lang-opt', '日本語');
  check(await visible(page, '#attract') && (await page.locator('#attract .tbl-chip').innerText()) === '12番テーブル', 'attract screen language button (stays on attract)');
}

/* ---------- run ---------- */
keyConsistency();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

out.push('== holdout orders placed through the UI ==');
for (const h of key.holdoutOrders) {
  try {
    await page.goto(url);
    await page.locator('#attract').click();
    await placeHoldout(page, h);
  } catch (e) {
    check(false, `${h.id} placed via UI`, e.message.split('\n')[0]);
  }
}
try { await negativePaths(page); } catch (e) { check(false, 'negative paths', e.message.split('\n')[0]); }
await browser.close();
check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

const placed = out.filter((l) => / placed via UI/.test(l));
const placedOk = placed.filter((l) => l.startsWith('PASS')).length;
const summary = [
  `bk8-tableorder self-check — ${new Date().toISOString().slice(0, 10)}`,
  `app: ${url}`,
  `holdouts placed through the UI: ${placedOk}/${placed.length} totals match answer-key.json`,
  `overall: ${failures === 0 ? 'PASS' : 'FAIL (' + failures + ' failing checks)'}`,
  '',
];
fs.writeFileSync(path.join(here, 'RESULT.txt'), summary.concat(out).join('\n') + '\n');
console.log(summary.concat(out).join('\n'));
process.exit(failures ? 1 : 0);
