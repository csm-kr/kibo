// Walks every screen of the Doughhouse kiosk (kiosk/index.html) and records what a skill depends on: the tappable
// labels (driver.mjs), the accessibility tree (roles and names) and the cart text the product bridge parses
// (src/lib/bridge/verify.ts). A restyle must leave all three unchanged (14-final:2), checked by restyle.test.mjs
// against fixtures/doughhouse-screens.json, which was written from the page before the restyle:
//   node spikes/kibo-learn/kiosk-screens.mjs --write
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openKiosk, snapshot, act } from './driver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE = path.join(here, 'fixtures/doughhouse-screens.json');
export const KIOSK_FILE = path.join(here, 'kiosk/index.html');

const TOTAL = /합계\s*([0-9,]+)원/;
const LINE = /^(.+?)(?: \((.+)\))? x(\d+) ([0-9,]+)원/;

async function record(page, alerts, name) {
  const snap = await snapshot(page, alerts);
  const labels = JSON.parse(snap.match(/TAPPABLE LABELS: (.*)/)[1]);
  const tree = await page.locator('body').ariaSnapshot();
  const text = await page.evaluate(() => document.body.innerText);
  const total = text.match(TOTAL)?.[1] ?? null;
  const lines = text.split('\n').map((l) => l.trim().match(LINE)?.[0]).filter(Boolean);
  return { name, labels, tree, total, lines };
}

/** Every screen and dialog a skill can reach, in a fixed order, with two cart lines on the way. */
export async function walkScreens() {
  process.env.KIOSK_URL = pathToFileURL(KIOSK_FILE).href;
  const { browser, page, alerts } = await openKiosk();
  const out = [];
  const click = (label) => act(page, { op: 'click', label });
  const role = (r, name) => act(page, { op: 'click', role: r, name });
  try {
    out.push(await record(page, alerts, 'home'));
    await click('화면을 터치하여 주문을 시작하세요');
    out.push(await record(page, alerts, 'where'));
    await click('🛍 가져갈게요');
    out.push(await record(page, alerts, 'menu 피자'));
    // The sold-out tile's label is its bold 품절 mark, not its name (the most prominent text).
    await click('품절');
    out.push(await record(page, alerts, 'sold out alert'));
    await click('페퍼로니');
    out.push(await record(page, alerts, 'pizza options'));
    await click('장바구니 담기');
    out.push(await record(page, alerts, 'pizza options, missing size'));
    for (const o of ['라지', '씬', '베이컨', '올리브', '옥수수', '할라피뇨']) await role(/할라피뇨|옥수수|올리브|베이컨/.test(o) ? 'checkbox' : 'radio', o);
    out.push(await record(page, alerts, 'pizza options, too many toppings'));
    await click('+');
    await click('장바구니 담기');
    out.push(await record(page, alerts, 'upsell'));
    await click('사이드 보러가기');
    out.push(await record(page, alerts, 'menu 사이드, one line'));
    await click('음료');
    out.push(await record(page, alerts, 'menu 음료'));
    await click('콜라');
    out.push(await record(page, alerts, 'drink options'));
    await click('닫기');
    await click('제로콜라');
    await role('radio', '1.25L');
    await click('장바구니 담기');
    out.push(await record(page, alerts, 'menu 음료, two lines'));
    // 주문하기 and the card button are payment controls the driver refuses; the walk taps them directly.
    await page.click('#checkout');
    out.push(await record(page, alerts, 'pay'));
    await page.click('#cardPay');
    out.push(await record(page, alerts, 'pay, card'));
  } finally {
    await browser.close();
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const screens = await walkScreens();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(FIXTURE, JSON.stringify(screens, null, 2) + '\n');
    console.log(`wrote ${screens.length} screens to ${path.relative(process.cwd(), FIXTURE)}`);
  } else {
    for (const s of screens) console.log(s.name, JSON.stringify(s.labels), s.total, JSON.stringify(s.lines));
  }
}
