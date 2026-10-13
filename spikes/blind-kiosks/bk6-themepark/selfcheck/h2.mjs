// h2 (English): Full-Day Ride Pass, Disability discount, Adult 1 + Youth 1. Expected 91,000원.
import { launch, makeChecker, wonToInt } from './lib.mjs';

const c = makeChecker('h2');
const { browser, page: p, errors } = await launch();

await p.getByRole('button', { name: 'English' }).click();
c.check('attract switched to English', (await p.textContent('.att-touch')).includes('Touch the screen'));
await p.click('.att-touch');

await p.click('.tabs li:has-text("Ride Passes")');
await p.click('.card:has-text("Full-Day Ride Pass")');
await p.click('.sh-btns button:has-text("Add to cart")');
c.check('discount required error', (await p.textContent('.sh-err')).includes('Please select a discount type'));

await p.click('.seg-o:has-text("Disability")');
await p.click('.age:has-text("Adult") button:has-text("+")');
await p.click('.age:has-text("Youth") button:has-text("+")');
c.check('adult price after discount', (await p.textContent('.age:has-text("Adult") .age-p')) === '49,000원');
c.check('sheet total', (await p.textContent('.sh-sum b')) === '91,000원');
await p.click('.sh-btns button:has-text("Add to cart")');

c.check('membership popup shown', (await p.textContent('#modal')).includes('Are you a member?'));
await p.click('text=Continue as guest');
c.check('membership popup closed', !(await p.isVisible('#modal-wrap')));

await p.click('.bar-order');
const review = wonToInt(await p.textContent('#review-total'));
c.check('review line text', (await p.textContent('.rv-list')).includes('Disability / Adult 1 · Youth 1'));
await p.click('button:has-text("Pay")');
const pay = wonToInt(await p.textContent('#pay-total'));
c.check('review total equals payment total', review === pay, `${review} vs ${pay}`);
await p.click('.meth:has-text("Credit/Debit card")');
await p.click('#modal button:has-text("Proceed")');
c.check('practice notice shown', (await p.textContent('.pay-notice')).includes('No real payment'));

await browser.close();
c.finish(pay, errors);
