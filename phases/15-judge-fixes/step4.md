# Step 4: bridge-parity

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN, ARCHITECTURE "KIBO Learn bridge", SECURITY (payment rule).
- `spikes/blind-kiosks/ROUND3.md` and `ROUND4.md` ("Product bridge should adopt"), `spikes/kibo-learn/plan.mjs`, `spikes/kibo-learn/driver.mjs`, `spikes/kibo-learn/runner.mjs`, and the product side: `src/lib/adapters/learned.ts` (skill schema), `src/lib/bridge/*` (recipe.ts `planSteps`, labels.ts, the bridge runtime), `skills/doughhouse.json`, `e2e/learned.spec.ts`.
- `docs/ISSUE.md` I-234 (the product bridge has none of rounds 3–4).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judges (tech #4, impact #5): KIBO Learn's results come from the offline runner while the app's bridge lacks the round 3–4 features, so "learned once, replayed without AI" in the product is an earlier version.

## Task (tests first; keep existing skills working unchanged)
1. Skill schema (optional fields, backward compatible): `interrupts: [{ text, dismiss }]`, `declines: [{ choice, offer }]`, `chooseOptions.groups` (run named groups where the recipe stands), conditional groups skipped with their `after` steps (`appliesWhen`), `sharedGroups` if the learner emits them.
2. `planSteps` and the bridge runtime: answer declared interrupts before each step and once after a failed locate (retry that step once, never a refused step); honour `chooseOptions.groups` and skipped conditional groups exactly as `spikes/kibo-learn/plan.mjs` does (port the logic and its tests, do not reinvent it).
3. `declines`: the phone/agent says the offer is always declined, and an order that asks for it is refused before any tap.
4. Do NOT port `openReview` (pressing the kiosk's order button) into the product: the bridge never presses checkout; record that decision in KIBO_LEARN with the reason (payment rule).
5. Convert one round-4 fresh skill (`spikes/blind-kiosks/results/bk9-bunsik/final/skill.json`) with a small, tested converter `scripts/skill-import.ts` (`npm run skill:import -- <path> <kioskId>`) into the product format and prove in a unit test that `planSteps` produces the same click plan as the offline runner for 3 of its holdout orders. Do not add the snack bar as a public kiosk.
6. Update KIBO_LEARN, ARCHITECTURE, ISSUE I-234.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. `e2e/learned.spec.ts` (Doughhouse) still passes unchanged.
2. Update this step in `phases/15-judge-fixes/index.json`.

## Do not
- Do not let the bridge press any payment or order-sending control.
- Do not change the learner in `spikes/kibo-learn/` (it is frozen for the published results).
