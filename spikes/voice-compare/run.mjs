// Step 2: run one recognition system over the clips. Resumable: clips already done for that system are skipped.
// node --env-file=<repo>/.env run.mjs <system> [--lang ko|en] [--cond clean|noisy] [--limit N] [--conc N] [--retry-errors] [--only id1,id2]
// --only re-runs the listed clip ids even if done (e.g. after a clip was regenerated); report.mjs keeps the newest row per clip.
// Systems: see lib/systems.mjs. Output: results/raw/<system>.jsonl (one line per clip; transcripts of synthetic speech).
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from './lib/systems.mjs';
import { readWav, speechBounds } from './lib/audio.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sys = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const S = SYSTEMS[sys];
if (!S) { console.error(`unknown system "${sys}". Known: ${Object.keys(SYSTEMS).join(', ')}`); process.exit(1); }

mkdirSync(join(ROOT, 'results/raw'), { recursive: true });
const out = join(ROOT, `results/raw/${sys}.jsonl`);
const blocked = S.blocked();
const statusFile = join(ROOT, `results/raw/${sys}.status.json`);
if (!blocked && existsSync(statusFile)) rmSync(statusFile); // an earlier "not run" no longer applies
if (blocked) {
  writeFileSync(join(ROOT, `results/raw/${sys}.status.json`), JSON.stringify({ system: sys, status: 'not run', reason: blocked, at: new Date().toISOString() }, null, 1));
  console.log(`${sys}: ${blocked}`);
  process.exit(0);
}

const { clips } = JSON.parse(readFileSync(join(ROOT, 'audio/clips.json'), 'utf8'));
// Speech end measured on the clean clip (same timing for its noisy copy): end of the last 20 ms frame within 35 dB of the peak.
const speechEnd = new Map();
for (const c of clips.filter((c) => c.cond === 'clean')) {
  const { rate, samples } = readWav(readFileSync(join(ROOT, c.file)));
  speechEnd.set(`${c.uttId}_${c.voice}`, Math.round((speechBounds(samples, rate).end / rate) * 1000));
}

const prev = existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const retry = args.includes('--retry-errors');
const done = new Set(prev.filter((r) => !(retry && r.error)).map((r) => r.clipId));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
let todo = only ? clips.filter((c) => only.has(c.clipId)) : clips.filter((c) => !done.has(c.clipId));
if (opt('--lang')) todo = todo.filter((c) => c.lang === opt('--lang'));
if (opt('--cond')) todo = todo.filter((c) => c.cond === opt('--cond'));
if (opt('--limit')) todo = todo.slice(0, +opt('--limit'));
const conc = +opt('--conc', S.kind === 'stream' ? 4 : 6);
console.log(`${sys}: ${todo.length} clips to run (conc ${conc})`);

let i = 0, n = 0, quotaErrors = 0, stop = null;
const isQuota = (m) => /\b(429|402)\b|quota|billing|RESOURCE_EXHAUSTED|insufficient_quota/i.test(m);
async function worker() {
  while (i < todo.length && !stop) {
    const c = todo[i++];
    const clip = { ...c, speechEndMs: speechEnd.get(`${c.uttId}_${c.voice}`) };
    const row = { system: sys, clipId: c.clipId, uttId: c.uttId, lang: c.lang, voice: c.voice, cond: c.cond, at: new Date().toISOString() };
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const r = await S.run(clip);
        Object.assign(row, { transcript: r.transcript, latencyMs: r.latencyMs, ...r.extra, error: r.extra?.error });
        quotaErrors = 0;
        break;
      } catch (e) {
        const msg = String(e?.message ?? e).replace(/(sk-|AIza)[A-Za-z0-9_\-]+/g, '[redacted]').slice(0, 300);
        if (isQuota(msg)) { quotaErrors++; if (quotaErrors >= 5) stop = msg; }
        if (attempt < 3 && !stop) { await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
        Object.assign(row, { transcript: '', latencyMs: null, error: msg });
        break;
      }
    }
    appendFileSync(out, JSON.stringify(row) + '\n');
    n++;
    console.log(`[${n}/${todo.length}] ${c.clipId} ${row.latencyMs ?? '-'}ms ${row.error ? 'ERR ' + row.error.slice(0, 120) : row.transcript.slice(0, 60)}`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
if (stop) {
  writeFileSync(join(ROOT, `results/raw/${sys}.status.json`), JSON.stringify({ system: sys, status: 'stopped', reason: `repeated quota/billing errors: ${stop}`, at: new Date().toISOString() }, null, 1));
  console.log(`${sys}: stopped after repeated quota/billing errors`);
}
