// Re-runs the run 3 holdout orders (holdout.mjs, AI-free) against the restyled Doughhouse page (14-final:2) and
// writes results/run3/holdout.restyled.log next to the original holdout.log, which stays as it was.
//   node spikes/kibo-learn/holdout-restyled.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const run3 = path.join(here, 'results/run3');
process.env.KIOSK_URL = pathToFileURL(path.join(here, 'kiosk/index.html')).href;
process.chdir(run3); // holdout.mjs reads skill.json from the working directory

const lines = [];
const log = console.log;
console.log = (...a) => { lines.push(a.join(' ')); log(...a); };
await import('./holdout.mjs');
console.log = log;

const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
fs.writeFileSync(path.join(run3, 'holdout.restyled.log'),
  `# ${day}, holdout.mjs against results/run3/skill.json after the 14-final:2 restyle of spikes/kibo-learn/kiosk/index.html (written by holdout-restyled.mjs)\n${lines.join('\n')}\n`);
