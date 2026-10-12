// Lists clips whose newest result row is stale, per system: the clip WAV changed after the row was written
// (a TTS take was regenerated), or a streaming row ended well before the end of speech (latency < -500 ms: cut off early).
// Prints "<system> <id,id,...>" lines for: node stale.mjs | while read s ids; do node --env-file=.. run.mjs $s --only $ids; done
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from './lib/systems.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const { clips } = JSON.parse(readFileSync(join(ROOT, 'audio/clips.json'), 'utf8'));
const mtime = new Map(clips.map((c) => [c.clipId, statSync(join(ROOT, c.file)).mtimeMs]));
for (const sys of Object.keys(SYSTEMS)) {
  const f = join(ROOT, `results/raw/${sys}.jsonl`);
  if (!existsSync(f)) continue;
  const last = new Map();
  for (const l of readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); last.set(r.clipId, r); }
  const stale = [...last.values()].filter((r) => Date.parse(r.at) < mtime.get(r.clipId) || (SYSTEMS[sys].kind === 'stream' && r.latencyMs != null && r.latencyMs < -500)).map((r) => r.clipId);
  if (stale.length) console.log(sys, stale.join(','));
}
