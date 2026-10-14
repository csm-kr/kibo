// Kiosk Learner: Gemini explores an unseen kiosk UI through the accessibility tree,
// then writes a reusable skill (catalog + recipes) and self-tests it with the LLM-free runner.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openKiosk, snapshot, act } from './driver.mjs';
import { runOrder } from './runner.mjs';
import { audit } from './audit.mjs';
import { lintSkill } from './lint.mjs';
import { uncoveredGroups } from './plan.mjs';

// Flash-Lite by default: learning is many short tool turns, so input tokens dominate the cost.
// PROVIDER=openai runs the same loop on OpenAI Chat Completions (dev-time tuning only; deck numbers come from Gemini).
const PROVIDER = process.env.PROVIDER ?? 'gemini';
const MODEL = process.env.MODEL ?? (PROVIDER === 'openai' ? 'gpt-6-luna' : 'gemini-3.8-flash');
const PROJECT = 'kibo-2026';
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 150);
// Hard cost ceiling per run: stop once cumulative input tokens pass this.
const MAX_INPUT_TOKENS = Number(process.env.MAX_INPUT_TOKENS ?? 2_000_000);
const URL = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
const OPENAI_KEY = PROVIDER === 'openai'
  ? (process.env.OPENAI_API_KEY ?? (fs.readFileSync(process.env.ENV_FILE, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m) || [])[1])
  : null;
// Opt-in learning trace for the /learn viewer: one JSON and one screenshot per turn (no prompts, no model text, no keys).
const TRACE_DIR = process.env.TRACE_DIR ? path.resolve(process.env.TRACE_DIR) : null;

// gcloud access tokens live about an hour, and gcloud hands out its cached one while it is valid, so a run can start
// with little time left (I-188). Fetch a new one before it is 50 min old, and once more after a 401.
const TOKEN_MAX_AGE_MS = Number(process.env.TOKEN_MAX_AGE_MS ?? 50 * 60 * 1000);
let token = null, tokenAt = 0;
function accessToken(renew = false) {
  if (renew || !token || Date.now() - tokenAt > TOKEN_MAX_AGE_MS) {
    token = execSync('gcloud auth print-access-token').toString().trim();
    tokenAt = Date.now();
  }
  return token;
}
if (PROVIDER === 'gemini') accessToken();

// Which learner made a run (I-202): the commit, and whether spikes/kibo-learn had uncommitted changes.
function learnerVersion() {
  const cwd = path.dirname(fileURLToPath(import.meta.url));
  try {
    const commit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
    const dirty = execSync('git status --porcelain -- .', { cwd }).toString().trim().length > 0;
    return { commit, dirty };
  } catch { return { commit: null, dirty: null }; }
}
const LEARNER = learnerVersion();

const SYSTEM = `You are KIBO Kiosk Learner. You operate an unfamiliar self-order kiosk web UI that you have never seen.
Goal: produce a SKILL that lets a program with no AI place any order on this kiosk.

Your memory of old screens is erased after a few turns. So call record() right after you learn something:
one entry per menu item (its catalog entry as JSON, including option groups), and one per flow fact (how to start, popups, how to add to cart).
record() takes a JSON array too: record several items in one call. Never open an item you already recorded. records() lists what you have.
act() takes "steps" (a list) to do several steps in one call, e.g. close a sheet and open the next item; it returns the screen after the last one.

Work like this:
1. Explore: use snapshot/act to walk the whole flow (start, dine option, every category, open EVERY menu item to read its option groups, cart). Note popups that interrupt the flow (upsell, alerts) and sold-out items. Use reload to start over.
   A popup that can come up at any moment, between any two taps (a "still there?" timeout warning, an ad), goes in "interrupts".
   Never tap payment controls (pay, card, coupon): act refuses them and a skill never needs them. Put them in forbiddenLabels.
   One exception: the kiosk's order button (주문하기 / Order) opens its order review, where the kiosk shows the total it will charge
   (take-out or other charges included). With something in the cart, open it once with {"op":"openReview","label":"<that button>"},
   read the total and anything added to it, then tap only a back button there. Declare it in "review", and do not list the order button in forbiddenLabels.
2. As soon as the catalog draft has every category, call audit with the skill. It walks every category without AI and lists priced tiles missing from your catalog and tappable labels you have not explained. Fix them (explore and record the items, or add real controls to uiLabels) until audit says ok. It also opens every item and lists, in missingOptions, choices on the item's screen that its option groups lack: add them.
3. Call testSkill with at least 3 different orders that together use EVERY option group of every orderable item (a priced option of each group that has prices), qty>1, items from several categories, and a popup. An order passes only when the skill's own total equals the kiosk's total (on the order review when "review" is declared): the kiosk's total is what the customer pays. testSkill lists the option groups no passing order has used yet. When totals differ, fix prices, option deltas or "charges"; if you cannot make an option's price match, remove that option from the skill (orders with it are then refused) and say why in notes. Orders may be split over several calls, but they count only for the exact same skill and only while none failed; any change to the skill starts the count again. Fix and retest until the gate says ok.
4. Call finish with the final skill. finish is accepted only if this exact skill passed testSkill (>= 3 orders, every option group used, "review" declared when the kiosk shows an order button), audit and the skill lint.

Step format for act and recipes: {"op":"click"|"check"|"clickIfVisible"|"openReview", "label"?: string, "role"?: aria role, "name"?: accessible name, "exact"?: boolean, "text"?: visible text, "within"?: text}.
Targeting, in order of preference:
- "label": exact match against TAPPABLE LABELS in the snapshot (first text line of each clickable element). Best for tiles, tabs, toggles and buttons.
- "role"+"name": for radios/checkboxes/dialog buttons (name match is substring unless exact:true).
- "text": last resort.
- "within": when a label appears more than once (REPEATED LABELS lists them with the text near each), add the text near the one you mean: {"op":"click","label":"+","within":"에스프레소 샷"}. An error tells you when a label is ambiguous or missing and which labels contain it.
Recipe control ops: {"op":"forEach","over":"options","as":"option","steps":[...]}, {"op":"repeat","times":"{qtyMinus1}","steps":[...]},
and {"op":"chooseOptions","steps":[...]}: for each option group of the line's item, in catalog order, it runs the group's own "select" steps (or these steps) once per chosen option of that group, then the group's "after" steps.
Placeholders: {dineOption}, {category}, {item}, {option}, {qty}, {qtyMinus1}.

Skill schema:
{
 "kiosk": string,
 "categories": [every category tab label, in order],
 "uiLabels": [tappable labels on the menu screens that are controls, not items or categories, e.g. close/cancel buttons],
 "forbiddenLabels": [the kiosk's payment buttons; never clicked],
 "dineOptions": {"<our value: eat_in|take_out>": "<label to click>"},
 "catalog": [{"name","category","price":number,"soldOut":bool,"recipe"?: string,"optionGroups":[{"name","required":bool,"min":number,"max":number,
    "type"?: "single"|"multi"|"quantity", "appliesWhen"?: "<other group name>=<option name>", "select"?: [steps], "after"?: [steps],
    "options":[{"name","priceDelta":number,"maxQty"?: number}]}]}],
 "recipes": {"startOrder":[steps using {dineOption} = the label], "addToCart":[steps using {category},{item},{option},{qtyMinus1}], "<otherName>": [...] },
 (Items whose ordering flow differs from the common one may set "recipe":"<otherName>" in their catalog entry.)
 "cartTotalPattern": "JS regex string whose group 1 is the cart total digits as shown in the snapshot",
 "interrupts"?: [{"text": "<a phrase shown only on the popup>", "dismiss": <one step that closes it and keeps the order; never one that orders, pays, adds or starts over>}] (the runner answers them before each step and after a step times out),
 "review"?: {"open": [steps from the menu with a full cart to the order review, including one {"op":"openReview","label":"<order button>"}], "totalPattern": "JS regex, group 1 = the total on the review", "close"?: [steps back to the menu, e.g. a back button]},
 "charges"?: [{"name","amount":number,"dineOption"?: "<dine label>"}] (amounts the review adds once per order, e.g. a take-out container; only for that dine choice when dineOption is given),
 "notes": [strings: popups, rules, quirks]
}
Option groups:
- Option names are customer choices exactly as chooseOptions/forEach will click them (e.g. "라지", priceDelta 4000). Never record navigation (다음, 이전, 확인, 담기) or stepper buttons ("+", "−", "… 더하기") as options; testSkill and finish run a lint that rejects them.
- A "− n +" count (extra shot, topping count, drink count) is a group with "type":"quantity"; each option has "maxQty" (the largest count) and the group has "select": the steps that add one, usually {"op":"click","label":"+","within":"{option}"}. An order repeats the option name once per count.
- A multi-step dialog (set or combo with 다음): one group per step, each with "after": [{"op":"click","label":"다음"}], and the item's recipe uses chooseOptions.
- A group that appears only after another choice (ice amount only for iced) gets "appliesWhen": "<that group's name>=<that option's name>".
- A line quantity: prefer the item sheet's own quantity control before adding. A "+" on each cart line needs "within":"{item}".
Never invent data; only record what the UI shows.
Test order format: {"dineOption":"<label>","lines":[{"category","item","options":[names],"qty"}]}.`;

const stepSchema = { type: 'object', properties: { op: { type: 'string' }, label: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, exact: { type: 'boolean' }, within: { type: 'string' } }, required: ['op'] };
const tools = [{ functionDeclarations: [
  { name: 'snapshot', description: 'Accessibility tree of the current kiosk screen (plus any alert text).', parameters: { type: 'object', properties: {} } },
  { name: 'act', description: 'Perform one step ("step") or several in order ("steps"); returns the new snapshot or an error.', parameters: { type: 'object', properties: { step: stepSchema, steps: { type: 'array', items: stepSchema } } } },
  { name: 'reload', description: 'Reload the kiosk to its initial screen.', parameters: { type: 'object', properties: {} } },
  { name: 'record', description: 'Save findings so they survive memory pruning. kind: item | flow. data: JSON string of one entry or an array of entries.', parameters: { type: 'object', properties: { kind: { type: 'string' }, data: { type: 'string' } }, required: ['kind', 'data'] } },
  { name: 'records', description: 'List everything recorded so far.', parameters: { type: 'object', properties: {} } },
  { name: 'testSkill', description: 'Run the skill with the AI-free runner on a fresh kiosk for each order; returns pass/fail with kiosk cart total vs expected, the skill lint and the finish gate.', parameters: { type: 'object', properties: { skillJson: { type: 'string' }, ordersJson: { type: 'string', description: 'JSON array of orders' } }, required: ['skillJson', 'ordersJson'] } },
  { name: 'audit', description: 'AI-free coverage check of the skill against the live kiosk.', parameters: { type: 'object', properties: { skillJson: { type: 'string' } }, required: ['skillJson'] } },
  { name: 'finish', description: 'Submit the final skill.', parameters: { type: 'object', properties: { skillJson: { type: 'string' } }, required: ['skillJson'] } },
] }];

const { browser, page, alerts } = await openKiosk();
const contents = [{ role: 'user', parts: [{ text: 'Learn this kiosk. Current screen:\n' + await snapshot(page, alerts) }] }];
const stats = { turns: 0, acts: 0, tests: 0, inTok: 0, outTok: 0, cached: 0, t0: Date.now() };
let finalSkill = null;
const notes = { item: [], flow: [] };
let lastTestTurn = 0;
let lastPassedSkill = null;
// The finish gate, for this exact skill over one or more testSkill calls: >= 3 different orders passed and none failed
// (an order passes only when the skill's total equals the kiosk's), the passing orders together used every option
// group (uncoveredGroups, I-197), and the order review is declared when the kiosk showed its order button (I-195).
let gate = { key: null, passed: new Map(), failed: false, reviewOpener: null };
let lastAudit = null;
const optionWarned = new Set();
stats.audits = 0;

async function call(name, args) {
  try {
    if (name === 'record') {
      let data = args.data;
      try { const v = JSON.parse(data); if (Array.isArray(v)) data = v.map((x) => JSON.stringify(x)); } catch { /* plain text */ }
      (notes[args.kind] ?? notes.flow).push(...[data].flat());
      return { saved: true, items: notes.item.length, flows: notes.flow.length };
    }
    // A copy: pruning later shortens this response in place, never the records themselves.
    if (name === 'records') return { item: [...notes.item], flow: [...notes.flow] };
    if (name === 'snapshot') return { tree: await snapshot(page, alerts) };
    if (name === 'reload') { await page.reload(); return { tree: await snapshot(page, alerts) }; }
    if (name === 'act') {
      // Some models send both, with an empty list next to a real step.
      const steps = args.steps?.length ? args.steps : args.step ? [args.step] : [];
      if (!steps.length) return { error: 'act needs "step" or "steps"' };
      for (const [i, s] of steps.entries()) {
        stats.acts++;
        try { await act(page, s); } catch (e) {
          return { error: e.message.split('\n')[0], ...(steps.length > 1 ? { doneSteps: i } : {}), tree: await snapshot(page, alerts) };
        }
        await page.waitForTimeout(150);
      }
      return { tree: await snapshot(page, alerts) };
    }
    if (name === 'testSkill') {
      stats.tests++; lastTestTurn = stats.turns;
      const skill = JSON.parse(args.skillJson); const orders = JSON.parse(args.ordersJson);
      const lint = lintSkill(skill);
      const results = [];
      for (const o of orders) results.push(await runOrder(skill, o));
      const key = JSON.stringify(skill);
      if (gate.key !== key) gate = { key, passed: new Map(), failed: false, reviewOpener: null };
      results.forEach((r, i) => {
        if (r.ok) gate.passed.set(JSON.stringify(orders[i]), orders[i]); else gate.failed = true;
        if (r.reviewOpener) gate.reviewOpener = r.reviewOpener;
      });
      const uncovered = uncoveredGroups(skill, [...gate.passed.values()]);
      const needReview = !skill.review && gate.reviewOpener;
      const ok = !lint.length && !gate.failed && gate.passed.size >= 3 && !uncovered.length && !needReview;
      lastPassedSkill = ok ? key : null;
      console.log(`  test #${stats.tests}: ${results.map((r) => (r.ok ? 'PASS' : 'FAIL')).join(' ')}${lint.length ? ` lint=${lint.length}` : ''}`
        + `${uncovered.length ? ` uncovered=${uncovered.length}` : ''}${needReview ? ` review=${gate.reviewOpener}` : ''}`);
      const missing = [
        ...(gate.passed.size < 3 || gate.failed ? [`>= 3 different passing orders (now ${gate.passed.size}${gate.failed ? ', and one failed: fix the skill, which starts the count again' : ''})`] : []),
        ...(lint.length ? ['no lint errors'] : []),
        ...(uncovered.length ? [`passing orders that use these option groups (a priced option where the group has prices): ${uncovered.slice(0, 20).map((g) => `"${g.group}" (e.g. on ${g.item})`).join(', ')}${uncovered.length > 20 ? ` and ${uncovered.length - 20} more` : ''}`] : []),
        ...(needReview ? [`"review": the kiosk shows its order button ${JSON.stringify(gate.reviewOpener)}; open it with {"op":"openReview","label":${JSON.stringify(gate.reviewOpener)}}, read the total there with totalPattern, and do not list it in forbiddenLabels`] : []),
      ];
      return {
        results: results.map(({ shownTotal, expectedTotal, ...r }) => r), ...(lint.length ? { lint } : {}),
        gate: ok ? 'ok: finish accepts this exact skill if the audit passes' : `not yet: finish needs, for this exact skill, ${missing.join('; ')}`,
      };
    }
    if (name === 'audit') {
      stats.audits++;
      const r = await audit(JSON.parse(args.skillJson));
      lastAudit = r.ok;
      console.log(`  audit #${stats.audits}: ${r.ok ? 'OK' : 'GAPS'} missing=${r.missingItems.length} unknown=${r.unknownLabels.length} hidden=${Object.keys(r.hiddenUnder).length} itemsMissingOptions=${Object.keys(r.missingOptions).length}`);
      return r;
    }
    if (name === 'finish') {
      const sk = JSON.parse(args.skillJson);
      const lint = lintSkill(sk);
      if (lint.length) return { ok: false, error: 'Rejected by the skill lint.', lint };
      if (JSON.stringify(sk) !== lastPassedSkill) return { ok: false, error: 'Rejected: this exact skill must pass the testSkill gate first: at least 3 different orders (none failing), every option group used by a passing order, and "review" when the kiosk shows an order button.' };
      const cov = await audit(sk);
      lastAudit = cov.ok;
      console.log(`  finish audit: ${cov.ok ? 'OK' : 'GAPS'}`);
      if (!cov.ok) return { ok: false, error: 'Rejected by coverage audit. Explore and record what is missing, then test and audit again.', audit: cov };
      // Choices on an item's screen that its option groups lack: refused once per skill, so a false alarm cannot block finishing.
      if (Object.keys(cov.missingOptions ?? {}).length && !optionWarned.has(args.skillJson)) {
        optionWarned.add(args.skillJson);
        return { ok: false, error: 'These items show choices that are not in their option groups. Add them (then test again), or call finish again with this same skill if they are not customer choices.', missingOptions: cov.missingOptions };
      }
      finalSkill = sk; return { ok: true };
    }
    return { error: `unknown tool ${name}` };
  } catch (e) { return { error: e.message.split('\n')[0] }; }
}

// Old screen trees, failed-test snapshots and records() listings are stale and dominate token cost. They are
// replaced in blocks, every PRUNE_EVERY turns, keeping the last PRUNE_KEEP: between prunes the request only grows
// at its end, so the model's implicit prompt cache can serve the unchanged prefix (cached input is billed at about a tenth).
const PRUNE_EVERY = 4, PRUNE_KEEP = 2;
const OMITTED = '(old screen omitted)';
const heavy = (r) => r && ((typeof r.tree === 'string' && r.tree !== OMITTED) || r.results?.some((x) => x.snapshot) || Array.isArray(r.item));
function lighten(r) {
  if (typeof r.tree === 'string') r.tree = OMITTED;
  for (const x of r.results ?? []) if (x.snapshot) x.snapshot = OMITTED;
  if (Array.isArray(r.item)) { r.item = `(old list of ${r.item.length} items omitted; call records() for the current one)`; r.flow = '(omitted)'; }
}
function pruneHistory(responsesOf) {
  if (stats.turns % PRUNE_EVERY !== 0) return;
  const holders = responsesOf().filter((rs) => rs.some(heavy));
  for (const rs of holders.slice(0, -PRUNE_KEEP)) for (const r of rs) if (heavy(r)) lighten(r);
}

// One retry after a short wait on rate limits and server errors, one with a new access token after a 401;
// any other 400 is our own request and is not retried.
async function generate(body) {
  let retried = false, renewed = false;
  for (;;) {
    const res = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' }, body });
    if (res.status === 401 && !renewed) {
      renewed = true;
      console.error('HTTP 401, fetching a new access token and retrying once');
      accessToken(true);
      continue;
    }
    if (!retried && [429, 500, 503].includes(res.status)) {
      retried = true;
      console.error(`HTTP ${res.status}, retrying once in 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    return res.json().catch(() => ({ error: { code: res.status } }));
  }
}

// ---------- learning trace (TRACE_DIR) ----------
const traceStart = new Date().toISOString();
const kioskId = process.env.KIOSK_ID ?? path.basename(path.dirname(decodeURIComponent(new globalThis.URL(process.env.KIOSK_URL ?? 'file:///kiosk/index.html').pathname)));
function discoveries() {
  const items = notes.item.flatMap((d) => { try { return [JSON.parse(d)].flat(); } catch { return []; } }).filter((x) => x && typeof x === 'object');
  return {
    items: items.length,
    optionGroups: items.reduce((a, x) => a + (Array.isArray(x.optionGroups) ? x.optionGroups.length : 0), 0),
    categories: new Set(items.map((x) => x.category).filter(Boolean)).size,
  };
}
const stepLabels = (s) => Object.fromEntries(['op', 'label', 'role', 'name', 'text', 'within'].filter((k) => s?.[k] !== undefined).map((k) => [k, s[k]]));
function traceArgs(name, args) {
  if (name === 'act') return { steps: (args.steps?.length ? args.steps : [args.step]).filter(Boolean).map(stepLabels) };
  if (name === 'record') {
    let names = [];
    try { names = [JSON.parse(args.data)].flat().map((x) => x?.name).filter((n) => typeof n === 'string'); } catch { /* flow text */ }
    return { kind: args.kind, ...(names.length ? { names } : {}) };
  }
  if (name === 'testSkill') { try { return { orders: JSON.parse(args.ordersJson).length }; } catch { return {}; } }
  return {};
}
function summary(name, args, r) {
  if (r?.error && name !== 'finish') return `${name} failed: ${r.error}`;
  if (name === 'act') return `tapped ${(args.steps?.length ? args.steps : [args.step]).filter(Boolean).map((s) => s.label ?? s.name ?? s.text).join(' → ')}`;
  if (name === 'snapshot') return 'read the screen';
  if (name === 'reload') return 'reloaded the kiosk';
  if (name === 'record') { const n = traceArgs(name, args).names; return n?.length ? `recorded item ${n.join(', ')}` : `recorded a ${args.kind} fact`; }
  if (name === 'records') return `listed ${notes.item.length} items, ${notes.flow.length} facts`;
  if (name === 'testSkill') return `testSkill ${r.results.filter((x) => x.ok).length}/${r.results.length} passed${r.lint ? `, lint ${r.lint.length}` : ''}`;
  if (name === 'audit') return r.ok ? 'audit ok' : `audit: ${r.missingItems.length} missing, ${r.unknownLabels.length} unknown, ${Object.keys(r.hiddenUnder).length} hidden`;
  if (name === 'finish') return r.ok ? 'finish accepted' : 'finish rejected';
  return name;
}
let cdp = null;
async function traceTurn(n, done, usage) {
  if (!TRACE_DIR) return;
  const calls = done.map(({ name, args, response }) => ({ tool: name, args: traceArgs(name, args), resultSummary: summary(name, args, response) }));
  const turn = { n, at: new Date().toISOString(), tool: calls.map((c) => c.tool).join(', '), args: calls[0]?.args ?? {},
    resultSummary: calls.map((c) => c.resultSummary).join('; '), calls, discoveries: discoveries(), ...usage };
  fs.writeFileSync(path.join(TRACE_DIR, `turn-${n}.json`), JSON.stringify(turn, null, 2));
  try {
    cdp ??= await page.context().newCDPSession(page);
    const { width, height } = page.viewportSize();
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: 0, y: 0, width, height, scale: 720 / width } });
    fs.writeFileSync(path.join(TRACE_DIR, `turn-${n}.jpg`), Buffer.from(shot.data, 'base64'));
  } catch { /* a missing picture never stops learning */ }
}
function traceHeader(extra = {}) {
  if (!TRACE_DIR) return;
  fs.writeFileSync(path.join(TRACE_DIR, 'trace.json'), JSON.stringify({
    kioskId, provider: PROVIDER, model: MODEL, startedAt: traceStart, ...extra,
    gate: { tests: stats.tests, testsPassedForFinish: !!lastPassedSkill, audits: stats.audits, auditOk: lastAudit, finished: !!finalSkill },
    turns: stats.turns, inputTokens: stats.inTok, cachedInputTokens: stats.cached, outputTokens: stats.outTok,
  }, null, 2));
}
if (TRACE_DIR) { fs.mkdirSync(TRACE_DIR, { recursive: true }); traceHeader(); }

const NUDGE = 'Stop exploring. Call records(), write the skill JSON from it, and call testSkill now.';
const BUDGET_NUDGE = 'More than 60% of the token budget is spent. Stop exploring: write the skill JSON from records(), call audit, then testSkill.';
// Weak models keep exploring; after 60 turns without a test, push them to write the skill from their records.
// Also every 10th turn once 60% of the token budget is gone and the finish gate is not met yet.
const nudgeNow = () => (stats.turns - lastTestTurn > 60 && stats.turns % 20 === 0 ? NUDGE
  : stats.inTok > 0.6 * MAX_INPUT_TOKENS && !lastPassedSkill && stats.turns % 10 === 0 ? BUDGET_NUDGE : null);

// Every way out (finish, turn or token cap, API error, crash) ends below: the browser is closed,
// learn-stats.json is written and the process exits, so a run can never hang a harness step.
let crash = null;
try {
  if (PROVIDER === 'openai') await openaiLoop();
  else while (!finalSkill && stats.turns < MAX_TURNS && stats.inTok < MAX_INPUT_TOKENS) {
    stats.turns++;
    pruneHistory(() => contents.filter((c) => c.role === 'user').map((c) => c.parts.map((p) => p.functionResponse?.response).filter(Boolean)));
    const data = await generate(JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools }));
    if (!data.candidates) { console.error(JSON.stringify(data).slice(0, 500)); break; }
    const usage = { inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0 };
    stats.inTok += usage.inputTokens; stats.outTok += usage.outputTokens;
    stats.cached += data.usageMetadata?.cachedContentTokenCount ?? 0;
    const msg = data.candidates[0].content;
    contents.push(msg); // keep thought signatures intact
    const calls = (msg.parts ?? []).filter((p) => p.functionCall);
    if (!calls.length) { contents.push({ role: 'user', parts: [{ text: 'Continue. Use the tools; call finish when the skill passes tests.' }] }); continue; }
    const responses = [];
    const done = [];
    const nudge = nudgeNow();
    for (const { functionCall: fc } of calls) {
      console.log(`#${stats.turns} ${fc.name} ${fc.name === 'act' ? JSON.stringify(fc.args?.steps?.length ? fc.args.steps : fc.args?.step) : ''}`);
      const response = await call(fc.name, fc.args ?? {});
      done.push({ name: fc.name, args: fc.args ?? {}, response });
      responses.push({ functionResponse: { name: fc.name, response } });
    }
    // The nudge goes before the function responses: Vertex refuses a turn whose text part follows them
    // with "Requests ending with a model turn are not supported." (checked 10-13, I-185).
    if (nudge) responses.unshift({ text: nudge });
    contents.push({ role: 'user', parts: responses });
    await traceTurn(stats.turns, done, usage);
  }
} catch (e) {
  crash = e;
  console.error(`learner crashed: ${e.message.split('\n')[0]}`);
}
async function openaiLoop() {
  // Responses API: reasoning models can call tools here. Output items (reasoning + calls) go back in as input.
  const oaTools = tools[0].functionDeclarations.map((f) => ({ type: 'function', name: f.name, description: f.description, parameters: f.parameters }));
  const input = [{ role: 'developer', content: SYSTEM }, { role: 'user', content: contents[0].parts[0].text }];
  const outputs = new Map(); // function_call_output item -> its parsed response, pruned in place and re-serialized
  while (!finalSkill && stats.turns < MAX_TURNS && stats.inTok < MAX_INPUT_TOKENS) {
    stats.turns++;
    pruneHistory(() => input.filter((m) => outputs.has(m)).map((m) => [outputs.get(m)]));
    for (const [m, r] of outputs) m.output = JSON.stringify(r);
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input, tools: oaTools, reasoning: { effort: process.env.EFFORT ?? 'low' }, store: false, include: ['reasoning.encrypted_content'] }) });
    const data = await res.json();
    if (!data.output) { console.error(JSON.stringify(data).slice(0, 500)); break; }
    const usage = { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    stats.inTok += usage.inputTokens; stats.outTok += usage.outputTokens;
    stats.cached += data.usage?.input_tokens_details?.cached_tokens ?? 0;
    input.push(...data.output);
    const calls = data.output.filter((o) => o.type === 'function_call');
    if (!calls.length) { input.push({ role: 'user', content: 'Continue. Use the tools; call finish when the skill passes tests.' }); continue; }
    const nudge = nudgeNow();
    const done = [];
    for (const fc of calls) {
      let args = {};
      try { args = JSON.parse(fc.arguments || '{}'); } catch {}
      console.log(`#${stats.turns} ${fc.name} ${fc.name === 'act' ? JSON.stringify(args.steps?.length ? args.steps : args.step) : ''}`);
      const response = await call(fc.name, args);
      done.push({ name: fc.name, args, response });
      const item = { type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(response) };
      if (response && typeof response === 'object') outputs.set(item, response);
      input.push(item);
    }
    if (nudge) input.push({ role: 'user', content: nudge });
    await traceTurn(stats.turns, done, usage);
  }
}

await browser.close().catch(() => {});
const result = { provider: PROVIDER, model: MODEL, learner: LEARNER, cachedInputTokens: stats.cached, finished: !!finalSkill, turns: stats.turns, acts: stats.acts, tests: stats.tests, inputTokens: stats.inTok, outputTokens: stats.outTok, minutes: ((Date.now() - stats.t0) / 60000).toFixed(1), ...(crash ? { error: crash.message.split('\n')[0] } : {}) };
console.log(JSON.stringify(result));
if (finalSkill) fs.writeFileSync('skill.json', JSON.stringify(finalSkill, null, 2));
fs.writeFileSync('learn-stats.json', JSON.stringify(result, null, 2));
traceHeader({ endedAt: new Date().toISOString(), ...(crash ? { error: result.error } : {}) });
// Exit explicitly: any browser still open (a runner or audit that died mid-way) would keep Node alive after
// this line (I-187). Playwright kills it on exit.
process.exit(crash ? 1 : 0);
