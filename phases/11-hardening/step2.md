# Step 2: prompt-cache

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE "Limits and cost", TESTING "Measurements", RULE R-001.
- `evidence/cost-per-order.json` (a hero text order sends about 90k input tokens, almost all the ~9k-token instructions repeated per call; only about 7.6k were served from the implicit cache), `src/lib/agent/{model,chat,instructions,tools}.ts`, `scripts/measure-cost.ts`, `scripts/eval-agent.ts`, the latest `evals/results/*.md`.
- The installed `@google/genai` README/types for explicit context caching (`caches.create`, `cachedContent` in `generateContent` config, TTL) on both the Gemini API and Vertex AI.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Cost and latency per order are dominated by the same instructions being re-read on every model call. Explicit context caching is the documented way to pay less for repeated input and can lower latency. This is also the "scalability" story judges look for, but only with measured numbers.

## Task
0. **First fix I-155** (found in step 1): on a learned kiosk, when the model sends two cart commands in one response (e.g. `setDineOption` then `addToCart`), the second gets `CONFLICT` because the first is still pending for the bridge. In `runChat` (and the voice tool runner `src/lib/voice/toolRunner.ts`), when a learned-kiosk command returns `pending: true`, wait for the session's `pendingBridgeCommand` to clear (server: poll the store every 200 ms up to 12 s; voice: wait on the session stream with the same limit) before running the next call of that response; if it does not clear, return the pending/timeout result to the model for the remaining calls instead of sending them. Tests first with a fake store/bridge; mark I-155 fixed.
1. Measure first: run `npm run measure:cost` and `npm run eval:agent` and keep the result files as the baseline (they may already exist; reuse today's if unchanged code).
2. Add explicit caching for the **static** part of the text agent's prompt: per kiosk (and locale if the instructions differ), the menu block and the fixed rules go into a cached content with a TTL (e.g. 60 min) created lazily on first use and refreshed before expiry; the per-request part (current cart, status) stays in the request. Keep the static/dynamic split explicit in `buildInstructions` (tests first for the split). If the backend or model rejects caching (minimum token size, Vertex differences), fall back silently to the current behaviour and log one line.
3. Live voice: check whether the pinned Live config can reference a cache; if not, record that and change nothing.
4. Measure again with the same scripts; compare input tokens billed, cached tokens, latency median and p90, and the eval pass rate. **Keep the change only if** the pass rate does not drop and either cost or latency improves; otherwise revert it and record why. Save the comparison in `evidence/prompt-cache.json` and update the TESTING ledger (R-001).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
npm run measure:cost
```

## Verify
1. Run the AC commands; the comparison file exists.
2. Check: cache names or ids are not exposed to the browser; storage cost of the cache is included in the comparison (cache storage price per hour from the evidence file's price notes).
3. Update this step in `phases/11-hardening/index.json` (completed + summary with the before/after numbers / error / blocked).

## Do not
- Do not cache per-session data (carts) in shared caches.
- Do not claim savings without the measured files (R-001).
- Break existing tests.
