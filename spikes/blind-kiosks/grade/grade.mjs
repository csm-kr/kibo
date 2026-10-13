// AI-free grader for the blind kiosk test (spikes/blind-kiosks/PROTOCOL.md "Metrics").
// Usage: node grade.mjs <kioskId> <skill.json> [--label <name>] [--key <answer-key.json>] [--app <index.html>] [--no-orders]
// Prints grade JSON and writes it to spikes/blind-kiosks/results/<kioskId>/<label>/grade.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gradeCatalog, translateOrder, plannedSteps, forbiddenSteps, classify, totalCannotSee } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BLIND_ROOT = path.resolve(HERE, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

async function gradeOrders(key, skill, appPath) {
  // The driver reads KIOSK_URL when it opens the kiosk.
  process.env.KIOSK_URL = pathToFileURL(appPath).href;
  const { runOrder } = await import('../../kibo-learn/runner.mjs');
  const results = [];
  for (const h of key.holdoutOrders ?? []) {
    const translation = translateOrder(key, skill, h);
    let run = null;
    let forbidden = [];
    if (translation.ok) {
      forbidden = forbiddenSteps(plannedSteps(skill, translation.order), skill.forbiddenLabels ?? []);
      if (!forbidden.length) run = await runOrder(skill, translation.order);
    }
    const c = classify({ translation, forbidden, run, expectedTotal: h.expectedTotal });
    results.push({
      id: h.id, outcome: c.outcome, reason: c.reason ?? null, linesChecked: c.linesChecked ?? null,
      expectedTotal: h.expectedTotal, kioskTotal: run?.shownTotal ?? null, skillPredicts: run?.expectedTotal ?? null,
      ms: run?.ms ?? null, totalCannotSee: totalCannotSee(key, h), order: translation.order ?? null,
    });
    console.error(`  ${h.id} ${c.outcome}${c.reason ? ` (${c.reason})` : ''}`);
  }
  const n = (o) => results.filter((r) => r.outcome === o).length;
  return {
    total: results.length, correct: n('correct'), safeRefusal: n('safeRefusal'), unsafe: n('unsafe'),
    // Orders whose cart lines the runner could read; the rest were judged by the kiosk total alone.
    linesChecked: results.filter((r) => r.linesChecked).length,
    results,
  };
}

export async function gradeKiosk({ kioskId, skillPath, label, keyPath, appPath, runOrders = true }) {
  const key = readJson(keyPath);
  const skill = readJson(skillPath);
  const statsPath = path.join(path.dirname(skillPath), 'learn-stats.json');
  const learning = fs.existsSync(statsPath) ? readJson(statsPath) : null;
  const catalog = gradeCatalog(key, skill);
  const orders = runOrders ? await gradeOrders(key, skill, appPath) : null;
  const c = catalog;
  const summary = [
    `${kioskId}/${label}:`,
    learning ? `learning ${learning.finished ? 'finished' : 'not finished'}, ${learning.minutes} min, ${learning.turns} turns, ${learning.inputTokens} input tokens;` : 'no learn-stats.json;',
    `items ${c.items.matched}/${c.items.key} (precision ${c.items.precision}), price ${c.price.correct}/${c.price.of},`,
    `options exact ${c.options.itemsExact}/${c.options.items} (openable ${c.options.openableExact}/${c.options.openable});`,
    orders ? `orders correct ${orders.correct}, safe refusal ${orders.safeRefusal}, unsafe ${orders.unsafe} of ${orders.total} (cart lines read in ${orders.linesChecked})` : 'orders not run',
  ].join(' ');
  return {
    kioskId, label, gradedAt: new Date().toISOString(),
    files: { skill: path.relative(process.cwd(), skillPath), key: path.relative(process.cwd(), keyPath), app: path.relative(process.cwd(), appPath) },
    summary, learning, catalog, orders,
  };
}

export function writeGrade(grade) {
  const dir = path.join(BLIND_ROOT, 'results', grade.kioskId, grade.label);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'grade.json');
  fs.writeFileSync(file, JSON.stringify(grade, null, 2) + '\n');
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const noOrders = args.includes('--no-orders');
  const label = flag('--label'), keyArg = flag('--key'), appArg = flag('--app');
  const [kioskId, skillArg] = args.filter((a) => a !== '--no-orders');
  if (!kioskId || !skillArg) {
    console.error('usage: grade.mjs <kioskId> <skill.json> [--label <name>] [--key <answer-key.json>] [--app <index.html>] [--no-orders]');
    process.exit(2);
  }
  const skillPath = path.resolve(skillArg);
  const grade = await gradeKiosk({
    kioskId, skillPath,
    label: label ?? path.basename(path.dirname(skillPath)),
    keyPath: path.resolve(keyArg ?? path.join(BLIND_ROOT, kioskId, 'answer-key.json')),
    appPath: path.resolve(appArg ?? path.join(BLIND_ROOT, kioskId, 'app', 'index.html')),
    runOrders: !noOrders,
  });
  const file = writeGrade(grade);
  console.log(JSON.stringify(grade, null, 2));
  console.error(grade.summary);
  console.error(`written: ${path.relative(process.cwd(), file)}`);
}
