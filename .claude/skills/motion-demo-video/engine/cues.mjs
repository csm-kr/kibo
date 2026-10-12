// node cues.mjs > cues.json : dump the composition's sound cues and timeline constants
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage();
p.on('pageerror', (e) => console.error('pageerror:', e.message));
await p.goto(pathToFileURL(process.cwd() + '/index.html').href);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
console.log(JSON.stringify(await p.evaluate(() => ({ duration: window.__duration, T: window.__T, cues: window.__cues }))));
await b.close();
