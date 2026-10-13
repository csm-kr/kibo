# Step 0: security-audit

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. SECURITY (all), ARCHITECTURE "API", "Commands and actors", "Limits and cost", "Environment variables"; ADR-003, ADR-005, ADR-006, ADR-010, ADR-011; RULE (all).
- The whole server side: `src/app/api/**`, `src/lib/**` (commands, session, store, agent, voice, bridge, limits, health, http, tokens), `next.config.ts`, `Dockerfile`, `scripts/deploy.sh`, `firestore.rules`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judging runs for three weeks on a public URL, and the product's main promise is that the AI cannot pay. Many phases changed the server since the last independent review (phase 1). This step **only audits**; the next step fixes.

## Task
Audit like an attacker and like a reliability engineer. For each area, try to break it with a test or a script (local dev server, `STORE=memory`), not only by reading:
1. **Payment safety:** any path to `paying`/`paid` outside `confirmCheckout` in `confirming` (with the documented utterance or tap rules) and the kiosk's `cardAction`; learned kiosks must never reach `paying`. Include voice tool calls, chat rounds, scenario player, demo stand-in, fallback backends (`auto` retry must never re-apply a command).
2. **Actor and token handling:** device vs kiosk tokens, demo sessions holding both, `reissueClaim`, claim races, token leakage in SSE, responses, logs, URLs (fragment), `Referrer-Policy`.
3. **Abuse and cost:** per-IP limits (IPv6 /64, last `X-Forwarded-For` hop), daily and per-session caps for chat and voice, Live token constraints (uses 1, expiry, pinned config), `/api/health?deep=1` cost and abuse (it calls Gemini: is it rate-limited or cached enough that a loop cannot run up cost?), large bodies, long strings, unknown ids.
4. **Prompt injection and grounding:** learned-kiosk text in instructions, menu data marked as data, model text never rendered as HTML, the AI actions strip shows ids → names from data only.
5. **Availability:** SSE listener errors, Firestore init failure, Gemini 402/429/5xx paths, what a judge sees when each fails, memory store refused in production.
6. **Repo hygiene:** no secrets in the tree (search for key patterns and for the actual values' prefixes read from `.env` by a `node` script that prints only true/false), `.gitignore`/`.gcloudignore`/`.dockerignore`, no OpenAI/Microsoft code in `src/` (the offline comparisons live only in `spikes/`).
Write `phases/11-hardening/AUDIT.md`: findings ranked P0 → P2, each with the failing scenario (inputs → wrong outcome), evidence (test or script output), file:line and a one-line fix; plus a list of areas checked with no finding. Log each finding in `docs/ISSUE.md`. Do not change product code in this step except to add the failing tests as `it.skip` with the issue id (so step 1 can turn them on).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. `phases/11-hardening/AUDIT.md` exists with ranked findings and evidence.
2. Update this step in `phases/11-hardening/index.json` (completed + summary with the top findings / error / blocked; a P0 is not a reason to block: step 1 fixes it).

## Do not
- Do not run abuse tests against the deployed URL (it is shared and costs money); local only.
- Do not print secrets.
- Break existing tests.
