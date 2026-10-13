// Test preload (node --import): replaces fetch with a fake Vertex AI generateContent for learner.test.mjs.
// The model always calls record() (or FAKE_VERTEX_DEFAULT), so the learner loops until MAX_TURNS.
// It refuses what real Vertex refused on 10-13 (I-185): a user turn with a text part after its
// function responses gets HTTP 400 "Requests ending with a model turn are not supported."
import crypto from 'node:crypto';
import fs from 'node:fs';

const LOG = process.env.FAKE_VERTEX_LOG;
// FAKE_VERTEX_FAIL="<status>@<request number>": answer that request once with that status
// ("throw@<n>": the request fails like a dropped network connection).
const [failSpec, failAtSpec] = (process.env.FAKE_VERTEX_FAIL ?? '').split('@');
const failStatus = Number(failSpec), failAt = Number(failAtSpec);
// FAKE_VERTEX_CALLS='{"<request number>": {"name": "...", "args": {...}}}': call that tool instead of the default.
const CALLS = JSON.parse(process.env.FAKE_VERTEX_CALLS || '{}');
const DEFAULT = process.env.FAKE_VERTEX_DEFAULT ? JSON.parse(process.env.FAKE_VERTEX_DEFAULT) : null;
let n = 0;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

globalThis.fetch = async (_url, init) => {
  n++;
  const { contents } = JSON.parse(init.body);
  const last = contents.at(-1);
  const kinds = (last.parts ?? []).map((p) => (p.functionResponse ? 'functionResponse' : p.text !== undefined ? 'text' : 'other'));
  const text = (last.parts ?? []).map((p) => p.text ?? JSON.stringify(p.functionResponse?.response ?? '')).join(' ');
  // full: the whole history; prefix: the history without this turn's model reply and user turn (the previous request).
  fs.appendFileSync(LOG, JSON.stringify({ n, role: last.role, kinds, nudge: /Stop exploring/.test(text),
    auth: init.headers?.Authorization, full: hash(contents), prefix: hash(contents.slice(0, -2)), length: init.body.length }) + '\n');
  if (n === failAt && failSpec === 'throw') throw new TypeError('fetch failed');
  if (n === failAt) {
    if (failStatus === 400) return json(400, { error: { code: 400, message: 'Bad request.' } });
    if (failStatus === 401) return json(401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } });
    return new Response('<html>Service Unavailable</html>', { status: failStatus });
  }
  const textAfterResponse = kinds.lastIndexOf('text') > kinds.indexOf('functionResponse') && kinds.includes('functionResponse');
  if (last.role !== 'user' || textAfterResponse) {
    return json(400, { error: { code: 400, message: 'Requests ending with a model turn are not supported.', status: 'INVALID_ARGUMENT' } });
  }
  return json(200, {
    candidates: [{ content: { role: 'model', parts: [{ functionCall: CALLS[n] ?? DEFAULT ?? { name: 'record', args: { kind: 'flow', data: `fact ${n}` } } }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, cachedContentTokenCount: 4 },
  });
};
