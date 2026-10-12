// Step 2b: batch latency without load. The accuracy runs use several parallel requests per system (and several systems
// at once), which inflates batch round trips. This runs N clips one at a time per batch system and stores the times.
// node --env-file=<repo>/.env latency-sample.mjs [N=10] [system ...]   -> results/latency-sample.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from './lib/systems.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const [nArg, ...names] = process.argv.slice(2);
const N = +(nArg ?? 10);
const systems = names.length ? names : Object.keys(SYSTEMS).filter((s) => SYSTEMS[s].kind === 'batch');
const { clips } = JSON.parse(readFileSync(join(ROOT, 'audio/clips.json'), 'utf8'));
// A fixed spread: every 18th clip (both languages, all voices, clean and noisy).
const sample = clips.filter((_, i) => i % Math.floor(clips.length / N) === 0).slice(0, N);
const out = join(ROOT, 'results/latency-sample.json');
for (const sys of systems) {
  if (SYSTEMS[sys].blocked()) { console.log(sys, 'blocked'); continue; }
  const times = [];
  for (const c of sample) {
    try { const r = await SYSTEMS[sys].run({ ...c, speechEndMs: 0 }); times.push(r.latencyMs); }
    catch (e) { times.push(null); console.log(sys, c.clipId, 'error', String(e.message).slice(0, 120)); }
  }
  const ok = times.filter((t) => t != null).sort((a, b) => a - b);
  const median = ok.length ? (ok.length % 2 ? ok[ok.length >> 1] : Math.round((ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2)) : null;
  // Re-read before writing: two samplers may run side by side.
  const all = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  all[sys] = { clips: sample.map((c) => c.clipId), latencyMs: times, medianMs: median, minMs: ok[0] ?? null, maxMs: ok.at(-1) ?? null, at: new Date().toISOString() };
  console.log(sys, 'median', median, 'ms', JSON.stringify(times));
  writeFileSync(out, JSON.stringify(all, null, 1));
}
