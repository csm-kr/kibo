// Screenshots of the Doughhouse kiosk page for the before/after comparison of 14-final:2.
//   node phases/14-final/qa/kiosk-polish/pizza-shots.mjs <before|after>
// Opens the spike page as a file at 1080x1920 (the kiosk canvas) and 1080x1600 (the size it was learned at and
// is shown at in /learned and /demo).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const which = process.argv[2];
if (!['before', 'after'].includes(which)) throw new Error('usage: pizza-shots.mjs <before|after>');
const out = path.resolve('phases/14-final/qa/kiosk-polish', which);
const url = pathToFileURL(path.resolve('spikes/kibo-learn/kiosk/index.html')).href;

const browser = await chromium.launch();
for (const [w, h] of [[1080, 1920], [1080, 1600]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(url);
  const shot = (name) => page.screenshot({ path: path.join(out, `pizza-${name}-${w}x${h}.png`) });
  await shot('home');
  await page.click('#startBtn');
  await shot('where');
  await page.click('[data-where="포장"]');
  await shot('menu');
  await page.click('#items .tile[data-i="1"]');
  await shot('options');
  await page.getByRole('radio', { name: '라지' }).check();
  await page.getByRole('radio', { name: '씬' }).check();
  await page.getByRole('checkbox', { name: '베이컨' }).check();
  await page.click('#addBtn');
  await shot('upsell');
  await page.click('#upNo');
  await page.click('#tabs span:nth-child(3)');
  await page.click('#items .tile[data-i="1"]');
  await page.getByRole('radio', { name: '1.25L' }).check();
  await page.click('#addBtn');
  await shot('cart');
  await page.click('#checkout');
  await page.click('#cardPay');
  await shot('pay');
  await page.close();
}
await browser.close();
console.log(`pizza screenshots in ${path.relative(process.cwd(), out)}`);
