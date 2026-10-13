// h4 (Korean): 별사탕 츄러스 + 초코 소스 x2 (2+1 adds 1 free), 생수 500ml x1. Expected 11,500원.
// Also taps a sold-out item, adds a wrong item (고래 키링) and deletes it from the cart drawer.
import { launch, makeChecker, wonToInt } from './lib.mjs';

const c = makeChecker('h4');
const { browser, page: p, errors } = await launch();

await p.click('.att-touch');
await p.click('.tabs li:has-text("간식")');

await p.click('.card:has-text("고래 꼬리 핫도그")');
c.check('sold-out popup', (await p.textContent('#modal')).includes('품절된 상품입니다'));
await p.click('#modal button:has-text("확인")');

await p.click('.card:has-text("별사탕 츄러스")');
await p.click('.chk:has-text("초코 소스")');
await p.click('.qty-row button:has-text("+")');
c.check('sheet total 10,000원', (await p.textContent('.sh-sum b')) === '10,000원');
await p.click('.sh-btns button:has-text("담기")');
c.check('promo toast', (await p.textContent('#toast')).includes('무료로 추가'));
c.check('membership popup shown', (await p.textContent('#modal')).includes('회원이신가요?'));
await p.click('text=비회원으로 계속');

await p.click('.tabs li:has-text("음료")');
await p.click('.card:has-text("생수 500ml")');
await p.click('.sh-btns button:has-text("담기")');

// wrong item, then remove it
await p.click('.tabs li:has-text("기념품")');
await p.click('.card:has-text("고래 키링")');
await p.click('.bar-cart');
await p.waitForSelector('#drawer.open');
await p.click('#drawer .ln:has-text("고래 키링") .ln-del');
c.check('delete confirmation', (await p.textContent('#modal')).includes('삭제할까요?'));
await p.click('#modal button:has-text("삭제")');

const lines = await p.$$eval('#drawer .ln', (els) => els.map((e) => e.textContent));
c.check('3 lines left (churros, water, free churros)', lines.length === 3, JSON.stringify(lines));
c.check('free line present', lines.some((l) => l.includes('2+1 증정') && l.includes('0원')));
c.check('no 고래 키링', !lines.some((l) => l.includes('고래 키링')));

await p.click('#drawer button:has-text("주문하기")');
const review = wonToInt(await p.textContent('#review-total'));
await p.click('button:has-text("결제하기")');
const pay = wonToInt(await p.textContent('#pay-total'));
c.check('review total equals payment total', review === pay, `${review} vs ${pay}`);

await browser.close();
c.finish(pay, errors);
