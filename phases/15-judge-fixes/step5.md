# Step 5: ops-scale

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE (limits, SSE, capacity), SECURITY, `docs/plan/OPERATIONS.md`, `scripts/deploy.sh`, `scripts/deploy-voice.sh`, `scripts/prod-latency.ts`, `docs/plan/NUMBERS.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`. You may not run gcloud; write the files and tests only.

## Why (tech judge 8/10)
"Deploys run by hand from a laptop; no CI gate, canary or IaC; Firestore TTL is a manual step"; "scaling has a hard ceiling (SSE per screen, 3 × 80 ≈ 240 streams; limits and cache per instance; menus compiled into the build)"; "what stops a background voice from counting as the new utterance?". Also the typed-latency number on the deck (4.8 s, measured on an earlier revision) disagreed with the judges' 6.2–9.4 s.

## Task
1. `cloudbuild.yaml` (+ `docs/plan/OPERATIONS.md` section): on push to `main`, run `npm ci`, lint, unit tests, `npm run check:attacks` against a local production build, build the image, deploy to Cloud Run with `--no-traffic --tag candidate`, call `/api/health?deep=1` on the tag URL, then shift traffic to the new revision (`update-traffic --to-latest`). Not wired to a trigger here (a person creates the trigger); a script `scripts/ci-check.sh` that runs the same checks locally.
2. `scripts/ops-setup.sh`: idempotent gcloud commands (printed, with `--dry-run` default) for the Firestore TTL policies, the Cloud Monitoring uptime check on `/api/health?deep=1`, and an alert policy; referenced from OPERATIONS. No secrets.
3. ARCHITECTURE "Capacity and scale-out": the math (streams per screen, instances × concurrency, per-instance limits), today's ceiling, and the path: Firestore listeners scoped by custom tokens for the read side or a fan-out tier, shared limits in Memorystore, menus and skills in Firestore with a TTL cache and live `soldOut`; what it costs to keep a kiosk stream open (from Cloud Run pricing, with URL and date, or say "not computed").
4. SECURITY: answer "what stops a background voice from counting as the new utterance": half-duplex mic, ≥ 1.5 s after the review, and the payment still needs the kiosk's own card action by a person; the tap-only option for strict sites (a server flag `CONFIRM_TAP_ONLY`, default off, implemented and tested: when on, `confirmCheckout` from the AI is always refused with the tap message).
5. Production typed latency: re-measure with `scripts/prod-latency.ts` against the deployed URL (12 typed turns, one session per 3 turns, sequential; ≤ 12 AI messages) → `evidence/prod-latency.json` with the revision from `/api/health`; update NUMBERS.md and every surface that quotes typed latency (landing, README, SUBMISSION) with the new median and p90; keep the older run listed with its revision.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. `CONFIRM_TAP_ONLY` has tests for both settings; default behaviour unchanged.
2. Update this step in `phases/15-judge-fixes/index.json`.

## Do not
- Do not run gcloud or deploy.
- Do not put secrets or project numbers beyond what the repo already shows into new files.
