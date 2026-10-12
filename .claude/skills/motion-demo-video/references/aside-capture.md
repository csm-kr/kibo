# Capturing with Aside (`aside repl`)

Aside is the user's own browser, so it has their logins. Use it for (a) reference videos that `/watch` cannot download and (b) real screens of an app that needs login. Run `aside guide` and `aside guide repl` first.

Gotchas (Aside CLI 1.26):
- `aside repl "<js>"` is one-shot: the tab closes after each call and there is a 120s limit. Do one whole capture per call.
- Use the page returned by `openTab(url)`. `fs` writes under `./artifacts/`. Print `path.resolve('./artifacts')` and copy the files out right away, because the session id changes every call.
- Element `clip` screenshots came back with the wrong offset. Take full screenshots and crop with PIL using `getBoundingClientRect()` × devicePixelRatio (2 on a Retina Mac, so screens are 2880×1800).
- `pressSequentially` types Korean syllables fine.

## Reference video frames (YouTube)

Seek the page's `<video>` and draw it to a canvas. YouTube frames are not tainted, so `toDataURL` works. Force 1080p first or frames come out blurry. About 5–8 frames per second of wall time.

```js
const pg = await openTab('https://www.youtube.com/watch?v=<id>');
await pg.evaluate(() => { const mp = document.getElementById('movie_player'); try { mp.setPlaybackQualityRange('hd1080','hd1080'); mp.setPlaybackQuality('hd1080'); } catch (e) {} });
await fs.mkdir('./artifacts/f', { recursive: true });
const T0 = Date.now();
for (let t = START; t < END && Date.now() - T0 < 105000; t += STEP) {
  const b64 = await pg.evaluate(async (t) => {
    const v = document.querySelector('video'); v.muted = true; v.pause();
    await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = t; });
    for (let i = 0; i < 40 && v.readyState < 3; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    c.getContext('2d').drawImage(v, 0, 0, 1920, 1080);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, t);
  await fs.writeFile(`./artifacts/f/t${String(Math.round(t * 10)).padStart(5, '0')}.jpg`, Buffer.from(b64, 'base64'));
}
console.log(path.resolve('./artifacts/f'));
```

Step 0.5s for an overview and 0.25s across transitions. Build timestamped contact sheets with PIL and actually look at them; the transitions live between frames that a 1fps sheet skips.

## Real app screens (logged in)

- One screenshot per keystroke gives exact typing footage with no timing noise. Then screenshot in a loop (about 7 fps) to catch loading and blur-up.
- Wait for visible images before a still: poll `[...document.images]` in the viewport until `complete && naturalWidth > 0`.
- Measure every camera target in the same call (input box, first result, title, the brand dot) with `getBoundingClientRect()`. Text that changes per load (random greetings) must be measured from the captured image, not a later load.
- Never send, post, or delete anything to get footage. Type, screenshot, then clear the field.

```js
const pa = await openTab('https://app.example.com/search');
await fs.mkdir('./artifacts/A', { recursive: true });
let n = 0; const shot = (tag) => pa.screenshot({ path: `./artifacts/A/${String(n++).padStart(3, '0')}_${tag}.jpg`, type: 'jpeg', quality: 92 });
const box = pa.locator('input[type=search]');
await box.click(); await shot('focus');
for (const ch of [...'sunset at the beach']) { await box.pressSequentially(ch); await shot('k'); }
await box.press('Enter');
const t0 = Date.now(); while (Date.now() - t0 < 9000) await shot('r');
```

For the composition, keep one full-size still per screen and crop only the changing region (the input row, the comment box) for the per-frame sequence. Dozens of full 2880×1800 frames will exhaust the renderer's memory.
