// AI-free grader for the blind kiosk test (spikes/blind-kiosks/PROTOCOL.md "Metrics").
// Usage: node grade.mjs <kioskId> <skill.json> [--label <name>] [--out <file name>] [--key <answer-key.json>] [--app <index.html>] [--no-orders]
// Prints grade JSON and writes it to spikes/blind-kiosks/results/<kioskId>/<label>/<out> (default grade.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gradeCatalog, translateOrder, plannedSteps, forbiddenSteps, classify, totalCannotSee, notLearnedOrders, keyItemNames, gradedTotal } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BLIND_ROOT = path.resolve(HERE, '..');
// 2: cart lines come from the kiosk's cart panel, opened if it is a closed drawer (run.mjs); 1: accessibility-tree list items.
export const GRADER_VERSION = 2;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

async function gradeOrders(key, skill, appPath) {
  // The driver reads KIOSK_URL when it opens the kiosk.
  process.env.KIOSK_URL = pathToFileURL(appPath).href;
  const { runAndReadCart } = await import('./run.mjs');
  const { runOrder } = await import('../../kibo-learn/runner.mjs');
  const names = key.items.flatMap(keyItemNames);
  const results = [];
  for (const h of key.holdoutOrders ?? []) {
    const translation = translateOrder(key, skill, h);
    let run = null;
    let review = null;
    let forbidden = [];
    if (translation.ok) {
      forbidden = forbiddenSteps(plannedSteps(skill, translation.order), skill.forbiddenLabels ?? []);
      if (!forbidden.length) run = await runAndReadCart(skill, translation.order, names);
      // Round 3 (I-195): a skill that declares its order review is replayed once more by the runner, which opens the
      // review and reads the kiosk's total there (the total the customer pays, charges included).
      if (run && !run.error && skill.review) review = await runOrder(skill, translation.order);
    }
    // Grader v2 as it was: the menu cart's total. With a review, the kiosk's total is the review's.
    const cartOnly = classify({ translation, forbidden, run, expectedTotal: gradedTotal(h) });
    const kioskRun = review ? { ...run, shownTotal: review.kioskTotal, error: review.error ? `review replay: ${review.error}` : undefined } : run;
    const c = review ? classify({ translation, forbidden, run: kioskRun, expectedTotal: gradedTotal(h) }) : cartOnly;
    results.push({
      id: h.id, outcome: c.outcome, reason: c.reason ?? null, linesChecked: c.linesChecked ?? null,
      cartSource: run?.cartSource ?? null, cartOnlyOutcome: cartOnly.outcome,
      totalSource: review && !review.error ? 'review' : run && !run.error ? 'cart' : null,
      expectedTotal: gradedTotal(h), kioskTotal: kioskRun?.shownTotal ?? null, cartTotal: run?.shownTotal ?? null,
      skillPredicts: run?.expectedTotal ?? null,
      ms: run?.ms ?? null, interruptsAnswered: [...(run?.interruptsAnswered ?? []), ...(review?.interruptsAnswered ?? [])].length,
      totalCannotSee: totalCannotSee(key, h), order: translation.order ?? null,
    });
    console.error(`  ${h.id} ${c.outcome}${c.reason ? ` (${c.reason})` : ''}`);
  }
  const n = (o, k = 'outcome') => results.filter((r) => r[k] === o).length;
  return {
    total: results.length, correct: n('correct'), safeRefusal: n('safeRefusal'), unsafe: n('unsafe'),
    // The same orders judged by the menu cart's total only, as grader v2 did before round 3.
    cartOnly: { correct: n('correct', 'cartOnlyOutcome'), safeRefusal: n('safeRefusal', 'cartOnlyOutcome'), unsafe: n('unsafe', 'cartOnlyOutcome') },
    // Orders whose cart lines the runner could read; the rest were judged by the kiosk total alone.
    linesChecked: results.filter((r) => r.linesChecked).length,
    results,
  };
}

export async function gradeKiosk({ kioskId, skillPath, label, keyPath, appPath, runOrders = true }) {
  const key = readJson(keyPath);
  // The learner writes skill.json only when finish was accepted; without it the run is graded as "no skill".
  const skill = fs.existsSync(skillPath) ? readJson(skillPath) : null;
  const statsPath = path.join(path.dirname(skillPath), 'learn-stats.json');
  const learning = fs.existsSync(statsPath) ? readJson(statsPath) : null;
  const catalog = gradeCatalog(key, skill ?? {});
  const orders = !runOrders ? null : skill ? await gradeOrders(key, skill, appPath) : notLearnedOrders(key);
  const c = catalog;
  const summary = [
    `${kioskId}/${label}:`,
    learning ? `learning ${learning.finished ? 'finished' : 'not finished'}, ${learning.minutes} min, ${learning.turns} turns, ${learning.inputTokens} input tokens;` : 'no learn-stats.json;',
    skill ? '' : 'no skill;',
    `items ${c.items.matched}/${c.items.key} (precision ${c.items.precision}), price ${c.price.correct}/${c.price.of},`,
    `options exact ${c.options.itemsExact}/${c.options.items} (openable ${c.options.openableExact}/${c.options.openable});`,
    orders ? `orders correct ${orders.correct}, safe refusal ${orders.safeRefusal}, unsafe ${orders.unsafe}${orders.notLearned ? `, not learned ${orders.notLearned}` : ''} of ${orders.total} (cart lines read in ${orders.linesChecked}${skill?.review ? `; kiosk total from the order review; menu cart total only: ${orders.cartOnly.correct} / ${orders.cartOnly.safeRefusal} / ${orders.cartOnly.unsafe}` : ''})` : 'orders not run',
  ].filter(Boolean).join(' ');
  return {
    kioskId, label, grader: GRADER_VERSION, gradedAt: new Date().toISOString(), skill: skill ? 'present' : 'no skill',
    files: { skill: path.relative(process.cwd(), skillPath), key: path.relative(process.cwd(), keyPath), app: path.relative(process.cwd(), appPath) },
    summary, learning, catalog, orders,
  };
}

export function writeGrade(grade, out = 'grade.json') {
  const dir = path.join(BLIND_ROOT, 'results', grade.kioskId, grade.label);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, out);
  fs.writeFileSync(file, JSON.stringify(grade, null, 2) + '\n');
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const noOrders = args.includes('--no-orders');
  const label = flag('--label'), keyArg = flag('--key'), appArg = flag('--app'), out = flag('--out') ?? 'grade.json';
  const [kioskId, skillArg] = args.filter((a) => a !== '--no-orders');
  if (!kioskId || !skillArg || out.includes('/')) {
    console.error('usage: grade.mjs <kioskId> <skill.json> [--label <name>] [--out <file name>] [--key <answer-key.json>] [--app <index.html>] [--no-orders]');
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
  const file = writeGrade(grade, out);
  console.log(JSON.stringify(grade, null, 2));
  console.error(grade.summary);
  console.error(`written: ${path.relative(process.cwd(), file)}`);
}
