// Grader's replay of one holdout order (grader v2, 13-blind-kiosks:10, I-183). Same steps and total as the
// kibo-learn runner (runner.mjs runOrder, which the learner's testSkill also uses and this grader must not change),
// but the page stays open afterwards so the grader can read the kiosk's cart the way a person would: the visible
// cart panel, or, when the cart is a closed drawer, after tapping the kiosk's own cart button.
import { openKiosk, runSteps, snapshot, answerInterrupts } from '../../kibo-learn/driver.mjs';
import { isForbidden, lineVars, unsafeTargets } from '../../kibo-learn/plan.mjs';
import { expectedTotal } from '../../kibo-learn/runner.mjs';

// What a cart panel's heading or a cart button says (after any emoji). The grader is not bound by the skill's
// forbiddenLabels (bk6 lists 장바구니 there), but still never taps a payment or checkout control.
export const CART_HEAD = '^(장바구니|주문\\s*내역|담은\\s*(메뉴|상품|목록)|선택(한)?\\s*(메뉴|상품)|cart|my\\s*cart|your\\s*(order|cart)|order\\s*(list|summary)|basket)';

// Runs in the page. A cart panel is a visible element on screen whose first text line is a cart heading and that
// holds answer-key item names but no menu tile (a tappable element labelled with an item name, marked by the
// driver's snapshot). The one holding the most item names wins, then the shortest. Returns its text or null.
const FIND_CART = ({ names, head }) => {
  const HEAD = new RegExp(head, 'i');
  const n = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const keyNames = [...new Set(names.map(n).filter(Boolean))];
  const onScreen = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  let best = null;
  for (const el of document.querySelectorAll('body *')) {
    const text = el.innerText ?? '';
    const first = text.split('\n').map((l) => l.trim().replace(/^[^\p{L}\p{N}]+/u, '')).find(Boolean) ?? '';
    if (!HEAD.test(first) || !onScreen(el)) continue;
    const t = n(text);
    const score = keyNames.filter((k) => t.includes(k)).length;
    if (!score) continue;
    const tile = [...el.querySelectorAll('[data-kibo-label]')].some((c) => keyNames.includes(n(c.getAttribute('data-kibo-label'))));
    if (tile) continue;
    if (!best || score > best.score || (score === best.score && text.length < best.text.length)) best = { score, text, head: first };
  }
  return best && { text: best.text, head: best.head };
};

// Labels of the cart buttons on screen (driver marks), payment and checkout controls left out.
const CART_BUTTONS = ({ head }) => {
  const HEAD = new RegExp(head, 'i');
  return [...document.querySelectorAll('[data-kibo-label]')].map((e) => e.getAttribute('data-kibo-label'))
    .filter((l) => HEAD.test(l.trim().replace(/^[^\p{L}\p{N}]+/u, '')));
};

// The kiosk's cart as text: { text, source: 'visible' | 'opened' | null, head }.
export async function readCart(page, alerts, names) {
  await snapshot(page, alerts); // marks the tappable labels (driver), so menu tiles can be told apart
  const seen = await page.evaluate(FIND_CART, { names, head: CART_HEAD });
  if (seen) return { ...seen, source: 'visible' };
  const buttons = (await page.evaluate(CART_BUTTONS, { head: CART_HEAD })).filter((l) => !isForbidden(l));
  for (const label of [...new Set(buttons)]) {
    // A cart button the grader cannot tap says nothing about the order, so it never makes the order unsafe.
    try {
      await page.locator(`[data-kibo-label="${label.replace(/["\\]/g, '\\$&')}"]`).first().click({ timeout: 2000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(500); // a drawer slides in
    await snapshot(page, alerts);
    const opened = await page.evaluate(FIND_CART, { names, head: CART_HEAD });
    if (opened) return { ...opened, source: 'opened' };
  }
  return { text: '', source: null, head: null };
}

// Same contract as runOrder up to the menu cart's total (round 3: the skill's interrupts are answered the same way),
// plus cartSource and cartHead. The order review, if the skill has one, is not opened here: grade.mjs replays the
// order again with runOrder for the review total, so reading the cart (which may open a drawer) cannot disturb it.
// `names` are the answer key's item names (ko and en).
export async function runAndReadCart(skill, order, names) {
  let bad;
  try {
    bad = unsafeTargets(skill, order);
  } catch (e) {
    return { ok: false, error: `refused before any click: ${e.message}` };
  }
  if (bad.length) return { ok: false, error: `refused before any click: the plan clicks a forbidden label: ${bad.join(', ')}` };
  const answered = [];
  const opts = { forbidden: skill.forbiddenLabels, interrupts: skill.interrupts, answered };
  const interrupts = () => (answered.length ? { interruptsAnswered: answered } : {});
  const { browser, page, alerts } = await openKiosk();
  const t0 = Date.now();
  try {
    await runSteps(page, skill.recipes.startOrder, { dineOption: order.dineOption }, opts);
    for (const l of order.lines) {
      const item = skill.catalog.find((c) => c.name === l.item);
      await runSteps(page, skill.recipes[item?.recipe ?? 'addToCart'], lineVars(skill, l), opts);
    }
    await answerInterrupts(page, skill.interrupts, opts);
    const snap = await snapshot(page, alerts);
    const shown = Number((snap.match(new RegExp(skill.cartTotalPattern)) ?? [])[1]?.replace(/,/g, ''));
    const want = expectedTotal(skill, order);
    const ms = Date.now() - t0; // the replay alone, as the runner reports it
    const cart = await readCart(page, alerts, names);
    return { ok: shown === want, shownTotal: shown, expectedTotal: want, ms, cart: cart.text, cartSource: cart.source, cartHead: cart.head, ...interrupts() };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0], ...interrupts(), snapshot: await snapshot(page, alerts) };
  } finally {
    await browser.close();
  }
}
