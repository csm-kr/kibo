// Step 3: score every raw result and write results.json plus results/tables.md (tables pasted into RESULTS.md).
// node report.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from './lib/systems.mjs';
import { scoreClip } from './lib/score.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(ROOT, 'dataset.json'), 'utf8')).utterances;
const utt = new Map(dataset.map((u) => [u.id, u]));
const clipsMeta = JSON.parse(readFileSync(join(ROOT, 'audio/clips.json'), 'utf8'));
const ORDER = Object.keys(SYSTEMS);

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);

const rows = [];
const status = {};
for (const sys of ORDER) {
  const st = join(ROOT, `results/raw/${sys}.status.json`);
  if (existsSync(st)) status[sys] = JSON.parse(readFileSync(st, 'utf8'));
  const f = join(ROOT, `results/raw/${sys}.jsonl`);
  if (!existsSync(f)) continue;
  // Keep the last row per clip (a --retry-errors run appends a newer row).
  const last = new Map();
  for (const l of readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); last.set(r.clipId, r); }
  for (const r of last.values()) {
    const u = utt.get(r.uttId);
    const failed = !!r.error && !r.transcript || !r.transcript;
    rows.push({ ...r, reference: u.text, failed, ...scoreClip(u, r.transcript ?? '') });
  }
}

function agg(rs) {
  const ok = rs.filter((r) => !r.failed);
  return {
    n: rs.length,
    // Corpus-level CER/WER: total edits over total reference length, so a one-syllable "네" misheard as a long phrase
    // does not dominate the mean.
    errorRate: rs.length ? rs.reduce((a, r) => a + r.edits, 0) / rs.reduce((a, r) => a + r.refLen, 0) : null,
    termRecall: rs.length ? rs.reduce((a, r) => a + r.termHits, 0) / rs.reduce((a, r) => a + r.termTotal, 0) : null,
    allTermsClips: rs.length ? rs.filter((r) => r.termHits === r.termTotal).length / rs.length : null,
    medianLatencyMs: median(ok.map((r) => r.latencyMs)),
    medianFirstModelOutputMs: median(ok.map((r) => r.firstModelOutputMs)),
    medianLastDeltaMs: median(ok.map((r) => r.lastDeltaMs)),
    failures: rs.length - ok.length,
  };
}

const summary = [];
for (const sys of ORDER) {
  const rs = rows.filter((r) => r.system === sys);
  if (!rs.length) continue;
  for (const lang of ['ko', 'en']) for (const cond of ['clean', 'noisy']) {
    const sub = rs.filter((r) => r.lang === lang && r.cond === cond);
    if (sub.length) summary.push({ system: sys, lang, cond, ...agg(sub) });
  }
  for (const lang of ['ko', 'en']) { const sub = rs.filter((r) => r.lang === lang); if (sub.length) summary.push({ system: sys, lang, cond: 'all', ...agg(sub) }); }
}

// ---------- markdown tables ----------
const label = (s) => `${s}${SYSTEMS[s].google ? '' : ' †'}`;
let md = '';
md += '## Summary (Korean)\n\nCER = character error rate over all clips (total edits / total reference characters, after removing spaces and punctuation; lower is better). Key-term recall = share of required menu names, numbers and options found (higher is better). All-terms = share of clips with every key term right. Latency: streaming = end of speech → final transcript; batch = request round trip (not comparable). † = offline comparison, not used in the product.\n\n';
md += '| System | Kind | CER clean | CER noisy | Key-term recall clean | Key-term recall noisy | All-terms clips (both) | Median latency ms (clean / noisy) | Failures |\n|---|---|---|---|---|---|---|---|---|\n';
const get = (s, lang, cond) => summary.find((x) => x.system === s && x.lang === lang && x.cond === cond);
for (const s of ORDER) {
  const c = get(s, 'ko', 'clean'), n = get(s, 'ko', 'noisy'), a = get(s, 'ko', 'all');
  if (!a) continue;
  md += `| ${label(s)} | ${SYSTEMS[s].kind} | ${pct(c?.errorRate)} | ${pct(n?.errorRate)} | ${pct(c?.termRecall)} | ${pct(n?.termRecall)} | ${pct(a.allTermsClips)} | ${c?.medianLatencyMs ?? '–'} / ${n?.medianLatencyMs ?? '–'} | ${a.failures}/${a.n} |\n`;
}
md += '\n## Summary (English)\n\nWER = word error rate over all clips (total word edits / total reference words, lowercase, no punctuation).\n\n';
md += '| System | Kind | WER clean | WER noisy | Key-term recall clean | Key-term recall noisy | All-terms clips (both) | Median latency ms (clean / noisy) | Failures |\n|---|---|---|---|---|---|---|---|---|\n';
for (const s of ORDER) {
  const c = get(s, 'en', 'clean'), n = get(s, 'en', 'noisy'), a = get(s, 'en', 'all');
  if (!a) continue;
  md += `| ${label(s)} | ${SYSTEMS[s].kind} | ${pct(c?.errorRate)} | ${pct(n?.errorRate)} | ${pct(c?.termRecall)} | ${pct(n?.termRecall)} | ${pct(a.allTermsClips)} | ${c?.medianLatencyMs ?? '–'} / ${n?.medianLatencyMs ?? '–'} | ${a.failures}/${a.n} |\n`;
}

md += '\n## Korean key-term recall by voice (clean + noisy)\n\n| System | ' + clipsMeta.voices.map((v) => v.key).join(' | ') + ' |\n|---|' + clipsMeta.voices.map(() => '---').join('|') + '|\n';
for (const s of ORDER) {
  const rs = rows.filter((r) => r.system === s && r.lang === 'ko');
  if (!rs.length) continue;
  md += `| ${label(s)} | ` + clipsMeta.voices.map((v) => pct(agg(rs.filter((r) => r.voice === v.key)).termRecall)).join(' | ') + ' |\n';
}

md += '\n## Streaming detail (median ms after end of speech)\n\n| System | Final transcript | First model output | Last partial (delta) |\n|---|---|---|---|\n';
for (const s of ORDER.filter((s) => SYSTEMS[s].kind === 'stream')) {
  const rs = rows.filter((r) => r.system === s);
  if (!rs.length) continue;
  const a = agg(rs);
  md += `| ${label(s)} | ${a.medianLatencyMs ?? '–'} | ${a.medianFirstModelOutputMs ?? '–'} | ${a.medianLastDeltaMs ?? '–'} |\n`;
}

md += '\n## Five worst Korean clips per system\n\nSorted by key-term recall, then CER.\n';
for (const s of ORDER) {
  const rs = rows.filter((r) => r.system === s && r.lang === 'ko');
  if (!rs.length) continue;
  const worst = [...rs].sort((a, b) => a.termHits / a.termTotal - b.termHits / b.termTotal || b.errorRate - a.errorRate).slice(0, 5);
  md += `\n#### ${label(s)}\n\n| Clip | Reference | Transcript | CER | Missed terms |\n|---|---|---|---|---|\n`;
  for (const r of worst) md += `| ${r.clipId} | ${r.reference} | ${r.failed ? `(failed: ${String(r.error ?? 'empty').slice(0, 60)})` : r.transcript.replace(/\|/g, '/').replace(/\n/g, ' ')} | ${pct(r.errorRate)} | ${r.missedTerms.join(', ') || '–'} |\n`;
}

const lsFile = join(ROOT, 'results/latency-sample.json');
const latencySample = existsSync(lsFile) ? JSON.parse(readFileSync(lsFile, 'utf8')) : null;
if (latencySample) {
  md += '\n## Batch round trip without load (10 clips, one request at a time)\n\n| System | Median ms | Min ms | Max ms | Measured at (UTC) |\n|---|---|---|---|---|\n';
  for (const s of ORDER.filter((s) => latencySample[s])) { const x = latencySample[s]; md += `| ${label(s)} | ${x.medianMs ?? '–'} | ${x.minMs ?? '–'} | ${x.maxMs ?? '–'} | ${x.at.slice(0, 16)} |\n`; }
}

// Clean clips that every system got wrong on the same term point at the TTS take, not the recognizers.
const allMiss = [];
for (const c of new Set(rows.filter((r) => r.cond === 'clean').map((r) => r.clipId))) {
  const rs = rows.filter((r) => r.clipId === c && !r.failed);
  if (rs.length < 5) continue;
  const common = rs[0].missedTerms.filter((t) => rs.every((r) => r.missedTerms.includes(t)));
  if (common.length) allMiss.push(`${c}: ${common.join(', ')} (missed by all ${rs.length} systems)`);
}
md += '\n## Clean clips where every system missed the same term\n\n' + (allMiss.length ? allMiss.map((x) => `- ${x}`).join('\n') : '- none') + '\n';

const notRun = ORDER.filter((s) => status[s]);
if (notRun.length) md += '\n## Systems not run or stopped\n\n' + notRun.map((s) => `- ${label(s)}: ${status[s].status}: ${status[s].reason}`).join('\n') + '\n';

writeFileSync(join(ROOT, 'results/tables.md'), md);
// RESULTS.md is hand-written around a generated block; refresh that block in place.
const resultsMd = join(ROOT, 'RESULTS.md');
if (existsSync(resultsMd)) {
  const doc = readFileSync(resultsMd, 'utf8');
  const a = doc.indexOf('<!-- tables:start -->'), b = doc.indexOf('<!-- tables:end -->');
  if (a >= 0 && b > a) writeFileSync(resultsMd, doc.slice(0, a) + '<!-- tables:start -->\n' + md.replace(/^## /gm, '### ') + '\n' + doc.slice(b));
}
writeFileSync(join(ROOT, 'results.json'), JSON.stringify({
  about: 'KIBO offline speech-recognition comparison. Synthetic Gemini TTS speech, not real people. Non-Google systems are an offline comparison, not used in the product.',
  generatedAt: new Date().toISOString(),
  audio: { rate: clipsMeta.rate, snrDb: clipsMeta.snrDb, babbleDb: clipsMeta.babbleDb, ttsModel: clipsMeta.ttsModel, voices: clipsMeta.voices, clipsCreatedAt: clipsMeta.createdAt },
  systems: Object.fromEntries(ORDER.map((s) => [s, { label: SYSTEMS[s].label, google: SYSTEMS[s].google, kind: SYSTEMS[s].kind, usedInProduct: false, offlineComparisonOnly: !SYSTEMS[s].google, status: status[s] ?? (rows.some((r) => r.system === s) ? { status: 'run' } : { status: 'not run' }) }])),
  dataset,
  summary,
  latencySample,
  results: rows.map(({ system, clipId, uttId, lang, voice, cond, reference, transcript, errorRate, edits, refLen, termHits, termTotal, missedTerms, latencyMs, firstModelOutputMs, vadEndMs, lastDeltaMs, commitAfterSpeechEndMs, failed, error, at }) =>
    ({ system, clipId, uttId, lang, voice, cond, reference, transcript, errorRate, edits, refLen, termHits, termTotal, missedTerms, latencyMs, firstModelOutputMs, vadEndMs, lastDeltaMs, commitAfterSpeechEndMs, failed, error, at })),
}, null, 1));
console.log(md);
