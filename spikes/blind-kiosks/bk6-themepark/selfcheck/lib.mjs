// Small shared helpers for the hand-written self-check scripts.
// Run from the kibo repo root so Playwright resolves from its node_modules:
//   cd <kibo> && node <this folder>/h2.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(process.cwd() + '/noop.js');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const APP = 'file://' + path.join(ROOT, 'app', 'index.html');
export const KEY = JSON.parse(readFileSync(path.join(ROOT, 'answer-key.json'), 'utf8'));

export async function launch() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  return { browser, page, errors };
}

export function wonToInt(s) {
  return parseInt(String(s).replace(/[^0-9]/g, ''), 10);
}

export function makeChecker(id) {
  const log = [];
  let ok = true;
  return {
    check(label, cond, detail = '') {
      if (!cond) ok = false;
      log.push(`  [${cond ? 'ok' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
    },
    finish(actual, errors) {
      const expected = KEY.holdoutOrders.find((h) => h.id === id).expectedTotal;
      const match = actual === expected;
      if (!match || errors.length) ok = false;
      log.push(`  page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
      log.push(`${id}: expected ${expected} / kiosk ${actual} => ${match ? 'MATCH' : 'MISMATCH'}`);
      log.push(`${id}: ${ok ? 'PASS' : 'FAIL'}`);
      console.log(log.join('\n'));
      if (!ok) process.exitCode = 1;
    },
  };
}
