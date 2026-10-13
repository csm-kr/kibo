# Step 3: load-check

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE "Limits and cost", ADR-001 (Cloud Run max 3 instances, concurrency 80), ADR-010 (SSE holds a request per open screen); `docs/plan/OPERATIONS.md` (quotas).
- Code: `src/app/api/**`, `src/lib/limits/*`, `src/lib/store/*`, `e2e/helpers.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
During judging several judges may open `/demo` at once. Each open demo holds two SSE streams, and each message calls Gemini. We need to know what breaks first and that limits fail politely.

## Task
`scripts/load-check.ts` (`npm run load:check`, `tsx --env-file=.env`): against a **local production build** (`npm run build` then `npm run start` with `STORE=memory` and `ALLOW_MEMORY_STORE=1`, on a free port; stop it at the end) simulate N concurrent demo users (N = 5, 10, 20): each creates a demo session, opens the two SSE streams, sends the hero order through the API commands (no model calls for N ≥ 10; with N = 5 also one real `/api/chat` message each, to see Gemini latency under parallel load), confirms, pays with the stand-in, and closes. Record per N: success rate, p50/p90 command latency, SSE event delay (command response → event received), memory and open handles of the server process, and which limit responded (429s are expected beyond the per-IP limits: give each simulated user its own `X-Forwarded-For` from a documentation range like 198.51.100.0/24 so the per-IP limit does not mask everything, and also run one case where all share one IP to see the polite failure).
Save `evidence/load-check.json` and a short `phases/11-hardening/LOAD.md` with what failed first, whether the failure was polite (plain message, no crash), and a recommendation (for example the Cloud Run concurrency or limits). Log problems in `docs/ISSUE.md`. Fix only clear bugs (crashes, leaks); limit changes need a note in OPERATIONS.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run load:check
```

## Verify
1. Run the AC commands; the evidence file exists.
2. Check: the script never targets the deployed URL.
3. Update this step in `phases/11-hardening/index.json` (completed + summary with the numbers / error / blocked).

## Do not
- Do not load-test the deployed service or call Gemini more than 5 × 1 times in this step (cost).
- Break existing tests.
