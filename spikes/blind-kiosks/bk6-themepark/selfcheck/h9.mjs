// h9 (Korean): 오후 자유이용권 일반 대인2 청소년1 소인1, 별사탕 츄러스 x4 (2 free),
// 해마 와플 + 치즈 소스 + 초코 소스. Expected 196,000원.
import { launch, makeChecker, wonToInt } from './lib.mjs';

const c = makeChecker('h9');
const { browser, page: p, errors } = await launch();

await p.click('.att-touch');
await p.click('.tabs li:has-text("자유이용권")');
await p.click('.card:has-text("오후 자유이용권")');
await p.click('.sh-btns button:has-text("담기")');
c.check('discount required error', (await p.textContent('.sh-err')).includes('할인 유형을 선택해 주세요'));
await p.click('.seg-o:has-text("일반")');
await p.click('.sh-btns button:has-text("담기")');
c.check('zero persons error', (await p.textContent('.sh-err')).includes('인원을 1명 이상'));

// try 경로 우대 first: youth/child disabled
await p.click('.seg-o:has-text("경로 우대")');
c.check('senior disables youth plus', await p.isDisabled('.age:has-text("청소년") button:has-text("+")'));
await p.click('.seg-o:has-text("일반")');

await p.click('.age:has-text("대인") button:has-text("+")');
await p.click('.age:has-text("대인") button:has-text("+")');
await p.click('.age:has-text("청소년") button:has-text("+")');
await p.click('.age:has-text("소인") button:has-text("+")');
c.check('ticket sheet total 172,000원', (await p.textContent('.sh-sum b')) === '172,000원');
await p.click('.sh-btns button:has-text("담기")');

c.check('membership popup shown', (await p.textContent('#modal')).includes('회원이신가요?'));
await p.click('#modal button:has-text("회원 적립하기")');
c.check('membership info', (await p.textContent('#modal')).includes('QR코드로 적립'));
await p.click('#modal button:has-text("확인")');

await p.click('.tabs li:has-text("간식")');
await p.click('.card:has-text("별사탕 츄러스")');
for (let i = 0; i < 3; i++) await p.click('.qty-row button:has-text("+")');
c.check('churros qty 4', (await p.textContent('.qty-row .cnt')) === '4');
await p.click('.sh-btns button:has-text("담기")');
c.check('promo toast says 2 free', (await p.textContent('#toast')).includes('2개가 무료로'));

await p.click('.card:has-text("해마 와플")');
await p.click('.chk:has-text("치즈 소스")');
await p.click('.chk:has-text("초코 소스")');
await p.click('.chk:has-text("연유 드리즐")');
c.check('max-2 error', (await p.textContent('.sh-err')).includes('최대 2개'));
c.check('only 2 selected', (await p.$$('.chk.on')).length === 2);
await p.click('.sh-btns button:has-text("담기")');

await p.click('.bar-cart');
await p.waitForSelector('#drawer.open');
const free = await p.textContent('#drawer .ln.free');
c.check('free line ×2 at 0원', free.includes('×2') && free.includes('0원'), free);
c.check('ticket line text', (await p.textContent('#drawer .ln:has-text("오후 자유이용권")')).includes('일반 / 대인 2명 · 청소년 1명 · 소인 1명'));

await p.click('#drawer button:has-text("주문하기")');
const review = wonToInt(await p.textContent('#review-total'));
await p.click('button:has-text("결제하기")');
const pay = wonToInt(await p.textContent('#pay-total'));
c.check('review total equals payment total', review === pay, `${review} vs ${pay}`);

await browser.close();
c.finish(pay, errors);
