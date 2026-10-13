// Test preload (node --import): replaces fetch with a fake Vertex AI generateContent for learner.test.mjs.
// The model always calls record(), so the learner loops without a browser action until MAX_TURNS.
// It refuses what real Vertex refused on 10-13 (I-185): a user turn with a text part after its
// function responses gets HTTP 400 "Requests ending with a model turn are not supported."
import fs from 'node:fs';

const LOG = process.env.FAKE_VERTEX_LOG;
// FAKE_VERTEX_FAIL="<status>@<request number>": answer that request once with that status.
const [failStatus, failAt] = (process.env.FAKE_VERTEX_FAIL ?? '').split('@').map(Number);
let n = 0;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (_url, init) => {
  n++;
  const { contents } = JSON.parse(init.body);
  const last = contents.at(-1);
  const kinds = (last.parts ?? []).map((p) => (p.functionResponse ? 'functionResponse' : p.text !== undefined ? 'text' : 'other'));
  const text = (last.parts ?? []).map((p) => p.text ?? JSON.stringify(p.functionResponse?.response ?? '')).join(' ');
  fs.appendFileSync(LOG, JSON.stringify({ n, role: last.role, kinds, nudge: /Stop exploring/.test(text) }) + '\n');
  if (n === failAt) return failStatus === 400 ? json(400, { error: { code: 400, message: 'Bad request.' } })
    : new Response('<html>Service Unavailable</html>', { status: failStatus });
  const textAfterResponse = kinds.lastIndexOf('text') > kinds.indexOf('functionResponse') && kinds.includes('functionResponse');
  if (last.role !== 'user' || textAfterResponse) {
    return json(400, { error: { code: 400, message: 'Requests ending with a model turn are not supported.', status: 'INVALID_ARGUMENT' } });
  }
  return json(200, {
    candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'record', args: { kind: 'flow', data: `fact ${n}` } } }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 },
  });
};
