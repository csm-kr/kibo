// Frame-accurate renderer: seeks the composition to each frame time, screenshots it,
// and pipes the PNGs into ffmpeg. Wall-clock playback is never recorded, so the
// output is deterministic no matter how slow the machine is.
//
// Usage: node render.mjs <composition.html> <out.mp4> [--fps 30] [--audio music.mp3] [--from 0] [--to <sec>]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const [input, output] = args;
if (!input || !output) {
  console.error('usage: node render.mjs <composition.html> <out.mp4> [--fps 30] [--audio file] [--from s] [--to s]');
  process.exit(1);
}
const fps = Number(opt('fps', 30));
const audio = opt('audio');
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

// Real Chrome, not the bundled Chromium: Chromium lacks H.264, so <video> footage would not decode.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve(input)).href);
await page.waitForFunction(() => typeof window.__seek === 'function' && window.__ready === true, null, { timeout: 60000 });

const duration = await page.evaluate(() => window.__duration);
const from = Number(opt('from', 0));
const to = Math.min(Number(opt('to', duration)), duration);
const total = Math.round((to - from) * fps);

// JPEG q95 frames: PNG encoding of photo-heavy frames was ~10x slower and the difference is invisible after x264.
const ffArgs = ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-'];
if (audio) ffArgs.push('-ss', String(from), '-i', audio, '-shortest', '-c:a', 'aac', '-b:a', '192k');
ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', output);
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)))));

const started = Date.now();
for (let f = 0; f < total; f++) {
  const t = from + f / fps;
  await page.evaluate((time) => window.__seek(time), t);
  const frame = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r${t.toFixed(1)}s / ${to.toFixed(1)}s  (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)`);
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`\nwrote ${output}: ${total} frames @ ${fps}fps`);
