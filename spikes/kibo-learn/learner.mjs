// Kiosk Learner: Gemini explores an unseen kiosk UI through the accessibility tree,
// then writes a reusable skill (catalog + recipes) and self-tests it with the LLM-free runner.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { openKiosk, snapshot, act } from './driver.mjs';
import { runOrder } from './runner.mjs';
import { audit } from './audit.mjs';

// Flash-Lite by default: learning is many short tool turns, so input tokens dominate the cost.
// PROVIDER=openai runs the same loop on OpenAI Chat Completions (dev-time tuning only; deck numbers come from Gemini).
const PROVIDER = process.env.PROVIDER ?? 'gemini';
const MODEL = process.env.MODEL ?? (PROVIDER === 'openai' ? 'gpt-6-luna' : 'gemini-3.8-flash');
const PROJECT = 'kibo-2026';
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 150);
// Hard cost ceiling per run: stop once cumulative input tokens pass this.
const MAX_INPUT_TOKENS = Number(process.env.MAX_INPUT_TOKENS ?? 2_000_000);
const URL = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
const token = PROVIDER === 'gemini' ? execSync('gcloud auth print-access-token').toString().trim() : null;
const OPENAI_KEY = PROVIDER === 'openai'
  ? (process.env.OPENAI_API_KEY ?? (fs.readFileSync(process.env.ENV_FILE, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m) || [])[1])
  : null;

const SYSTEM = `You are KIBO Kiosk Learner. You operate an unfamiliar self-order kiosk web UI that you have never seen.
Goal: produce a SKILL that lets a program with no AI place any order on this kiosk.

Your memory of old screens is erased after a few turns. So call record() right after you learn something:
one call per menu item (its catalog entry as JSON, including option groups), and one per flow fact (how to start, popups, how to add to cart).
Never open an item you already recorded. records() lists what you have.

Work like this:
1. Explore: use snapshot/act to walk the whole flow (start, dine option, every category, open EVERY menu item to read its option groups, cart, checkout entry). Note popups that interrupt the flow (upsell, alerts) and sold-out items. Use reload to start over.
2. Write the skill JSON (schema below) and call testSkill with at least 3 different orders covering: options from several groups, qty>1, a non-pizza item, and a popup. Fix and retest until all pass.
3. Call audit with the skill. It walks every category without AI and lists priced tiles missing from your catalog and tappable labels you have not explained. Fix them (explore and record the items, or add real controls to uiLabels) until audit says ok.
4. Call finish with the final skill. finish is accepted only if this exact skill passed testSkill (>= 3 orders) and audit.

Step format for act and recipes: {"op":"click"|"check"|"clickIfVisible", "label"?: string, "role"?: aria role, "name"?: accessible name, "exact"?: boolean, "text"?: visible text}.
Targeting, in order of preference:
- "label": exact match against TAPPABLE LABELS in the snapshot (first text line of each clickable element). Best for tiles, tabs and buttons.
- "role"+"name": for radios/checkboxes/dialog buttons (name match is substring unless exact:true).
- "text": last resort.
Recipe control ops: {"op":"forEach","over":"options","as":"option","steps":[...]} and {"op":"repeat","times":"{qtyMinus1}","steps":[...]}.
Placeholders: {dineOption}, {category}, {item}, {option}, {qtyMinus1}.

Skill schema:
{
 "kiosk": string,
 "categories": [every category tab label, in order],
 "uiLabels": [tappable labels on the menu screens that are controls, not items or categories, e.g. order/cancel buttons],
 "dineOptions": {"<our value: eat_in|take_out>": "<label to click>"},
 "catalog": [{"name","category","price":number,"soldOut":bool,"recipe"?: string,"optionGroups":[{"name","required":bool,"min":number,"max":number,"options":[{"name","priceDelta":number}]}]}],
 "recipes": {"startOrder":[steps using {dineOption} = the label], "addToCart":[steps using {category},{item},{option},{qtyMinus1}], "<otherName>": [...] },
 (Items whose ordering flow differs from the common one may set "recipe":"<otherName>" in their catalog entry. A count option such as an extra shot ×2 is written by repeating its name in the order's options list.)
 "cartTotalPattern": "JS regex string whose group 1 is the cart total digits as shown in the snapshot",
 "notes": [strings: popups, rules, quirks]
}
Option names in catalog must be exactly what forEach will click (e.g. "라지", priceDelta 4000). Never invent data; only record what the UI shows.
Test order format: {"dineOption":"<label>","lines":[{"category","item","options":[names],"qty"}]}.`;

const tools = [{ functionDeclarations: [
  { name: 'snapshot', description: 'Accessibility tree of the current kiosk screen (plus any alert text).', parameters: { type: 'object', properties: {} } },
  { name: 'act', description: 'Perform one step, returns the new snapshot or an error.', parameters: { type: 'object', properties: { step: { type: 'object', properties: { op: { type: 'string' }, label: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, exact: { type: 'boolean' } }, required: ['op'] } }, required: ['step'] } },
  { name: 'reload', description: 'Reload the kiosk to its initial screen.', parameters: { type: 'object', properties: {} } },
  { name: 'record', description: 'Save one finding so it survives memory pruning. kind: item | flow. data: JSON string.', parameters: { type: 'object', properties: { kind: { type: 'string' }, data: { type: 'string' } }, required: ['kind', 'data'] } },
  { name: 'records', description: 'List everything recorded so far.', parameters: { type: 'object', properties: {} } },
  { name: 'testSkill', description: 'Run the skill with the AI-free runner on a fresh kiosk for each order; returns pass/fail with kiosk cart total vs expected.', parameters: { type: 'object', properties: { skillJson: { type: 'string' }, ordersJson: { type: 'string', description: 'JSON array of orders' } }, required: ['skillJson', 'ordersJson'] } },
  { name: 'audit', description: 'AI-free coverage check of the skill against the live kiosk.', parameters: { type: 'object', properties: { skillJson: { type: 'string' } }, required: ['skillJson'] } },
  { name: 'finish', description: 'Submit the final skill.', parameters: { type: 'object', properties: { skillJson: { type: 'string' } }, required: ['skillJson'] } },
] }];

const { browser, page, alerts } = await openKiosk();
const contents = [{ role: 'user', parts: [{ text: 'Learn this kiosk. Current screen:\n' + await snapshot(page, alerts) }] }];
const stats = { turns: 0, acts: 0, tests: 0, inTok: 0, outTok: 0, t0: Date.now() };
let finalSkill = null;
const notes = { item: [], flow: [] };
let lastTestTurn = 0;
let lastPassedSkill = null;
stats.audits = 0; // finish is accepted only for a skill that just passed >= 3 test orders

async function call(name, args) {
  try {
    if (name === 'record') { (notes[args.kind] ?? notes.flow).push(args.data); return { saved: true, items: notes.item.length, flows: notes.flow.length }; }
    if (name === 'records') return notes;
    if (name === 'snapshot') return { tree: await snapshot(page, alerts) };
    if (name === 'reload') { await page.reload(); return { tree: await snapshot(page, alerts) }; }
    if (name === 'act') { stats.acts++; await act(page, args.step); await page.waitForTimeout(150); return { tree: await snapshot(page, alerts) }; }
    if (name === 'testSkill') {
      stats.tests++; lastTestTurn = stats.turns;
      const skill = JSON.parse(args.skillJson); const orders = JSON.parse(args.ordersJson);
      const results = [];
      for (const o of orders) results.push(await runOrder(skill, o));
      console.log(`  test #${stats.tests}: ${results.map((r) => (r.ok ? 'PASS' : 'FAIL')).join(' ')}`);
      lastPassedSkill = results.length >= 3 && results.every((r) => r.ok) ? JSON.stringify(skill) : null;
      return { results };
    }
    if (name === 'audit') {
      stats.audits++;
      const r = await audit(JSON.parse(args.skillJson));
      console.log(`  audit #${stats.audits}: ${r.ok ? 'OK' : 'GAPS'} missing=${r.missingItems.length} unknown=${r.unknownLabels.length} hidden=${Object.keys(r.hiddenUnder).length}`);
      return r;
    }
    if (name === 'finish') {
      const sk = JSON.parse(args.skillJson);
      if (JSON.stringify(sk) !== lastPassedSkill) return { ok: false, error: 'Rejected: call testSkill with this exact skill and at least 3 orders; all must pass before finish.' };
      const cov = await audit(sk);
      console.log(`  finish audit: ${cov.ok ? 'OK' : 'GAPS'}`);
      if (!cov.ok) return { ok: false, error: 'Rejected by coverage audit. Explore and record what is missing, then test and audit again.', audit: cov };
      finalSkill = sk; return { ok: true };
    }
  } catch (e) { return { error: e.message.split('\n')[0] }; }
}

// Old screen trees are stale and dominate token cost; keep only the most recent ones verbatim.
function pruneOldTrees(keep = 4) {
  const withTrees = contents.filter((c) => c.role === 'user' && c.parts.some((p) => p.functionResponse?.response?.tree));
  for (const c of withTrees.slice(0, -keep)) {
    for (const p of c.parts) if (p.functionResponse?.response?.tree) p.functionResponse.response.tree = '(old screen omitted)';
  }
}

if (PROVIDER === 'openai') await openaiLoop();
else while (!finalSkill && stats.turns < MAX_TURNS && stats.inTok < MAX_INPUT_TOKENS) {
  stats.turns++;
  pruneOldTrees();
  const res = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools }) });
  const data = await res.json();
  if (!data.candidates) { console.error(JSON.stringify(data).slice(0, 500)); break; }
  stats.inTok += data.usageMetadata?.promptTokenCount ?? 0; stats.outTok += data.usageMetadata?.candidatesTokenCount ?? 0;
  const msg = data.candidates[0].content;
  contents.push(msg); // keep thought signatures intact
  const calls = (msg.parts ?? []).filter((p) => p.functionCall);
  if (!calls.length) { contents.push({ role: 'user', parts: [{ text: 'Continue. Use the tools; call finish when the skill passes tests.' }] }); continue; }
  const responses = [];
  // Weak models keep exploring; after 60 turns without a test, push them to write the skill from their records.
  const nudge = stats.turns - lastTestTurn > 60 && stats.turns % 20 === 0;
  for (const { functionCall: fc } of calls) {
    console.log(`#${stats.turns} ${fc.name} ${fc.name === 'act' ? JSON.stringify(fc.args.step) : ''}`);
    responses.push({ functionResponse: { name: fc.name, response: await call(fc.name, fc.args ?? {}) } });
  }
  if (nudge) responses.push({ text: 'Stop exploring. Call records(), write the skill JSON from it, and call testSkill now.' });
  contents.push({ role: 'user', parts: responses });
}
async function openaiLoop() {
  // Responses API: reasoning models can call tools here. Output items (reasoning + calls) go back in as input.
  const oaTools = tools[0].functionDeclarations.map((f) => ({ type: 'function', name: f.name, description: f.description, parameters: f.parameters }));
  const input = [{ role: 'developer', content: SYSTEM }, { role: 'user', content: contents[0].parts[0].text }];
  const prune = () => {
    const withTree = input.filter((m) => m.type === 'function_call_output' && m.output.includes('"tree"'));
    for (const m of withTree.slice(0, -4)) m.output = JSON.stringify({ tree: '(old screen omitted)' });
  };
  while (!finalSkill && stats.turns < MAX_TURNS && stats.inTok < MAX_INPUT_TOKENS) {
    stats.turns++;
    prune();
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input, tools: oaTools, reasoning: { effort: process.env.EFFORT ?? 'low' }, store: false, include: ['reasoning.encrypted_content'] }) });
    const data = await res.json();
    if (!data.output) { console.error(JSON.stringify(data).slice(0, 500)); break; }
    stats.inTok += data.usage?.input_tokens ?? 0; stats.outTok += data.usage?.output_tokens ?? 0;
    stats.cached = (stats.cached ?? 0) + (data.usage?.input_tokens_details?.cached_tokens ?? 0);
    input.push(...data.output);
    const calls = data.output.filter((o) => o.type === 'function_call');
    if (!calls.length) { input.push({ role: 'user', content: 'Continue. Use the tools; call finish when the skill passes tests.' }); continue; }
    const nudge = stats.turns - lastTestTurn > 60 && stats.turns % 20 === 0;
    for (const fc of calls) {
      let args = {};
      try { args = JSON.parse(fc.arguments || '{}'); } catch {}
      console.log(`#${stats.turns} ${fc.name} ${fc.name === 'act' ? JSON.stringify(args.step) : ''}`);
      input.push({ type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(await call(fc.name, args)) });
    }
    if (nudge) input.push({ role: 'user', content: 'Stop exploring. Call records(), write the skill JSON from it, and call testSkill now.' });
  }
}

await browser.close();
const summary = { provider: PROVIDER, model: MODEL, cachedInputTokens: stats.cached ?? 0, finished: !!finalSkill, turns: stats.turns, acts: stats.acts, tests: stats.tests, inputTokens: stats.inTok, outputTokens: stats.outTok, minutes: ((Date.now() - stats.t0) / 60000).toFixed(1) };
console.log(JSON.stringify(summary));
if (finalSkill) fs.writeFileSync('skill.json', JSON.stringify(finalSkill, null, 2));
fs.writeFileSync('learn-stats.json', JSON.stringify(summary, null, 2));
