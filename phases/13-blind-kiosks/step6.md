# Step 6: learn-viewer

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN (all), PRD "KIBO Learn", UX "Flow C" and USER_JOURNEY J3 (a cold judge), UI_GUIDE (KIBO surfaces: the phone design tokens and the landing style), UI_QA; RULE R-001.
- The traces: `spikes/blind-kiosks/results/<kioskId>/final/trace/` (steps 4–5) and their `grade.json`; step 3's trace format in `spikes/kibo-learn/CHANGES.md`.
- Code: `src/app/page.tsx` (landing), `src/app/demo/*`, `src/components/demo/*` (place cards), `src/components/learned/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The user (10-13): "the learning part has to be visible too: the part where it sees a kiosk for the first time." Learning runs offline (Playwright + Gemini, minutes and cost per run), so the product shows a **faithful replay of a real recorded run**, never a mock.

## Task
1. **Pick runs:** the final trace of the blind kiosk with the best orders result and **unsafe = 0** (if none has unsafe = 0, pick the best and show its unsafe count plainly), plus Doughhouse (record a fresh traced Doughhouse run with the improved learner if no trace exists; one run, Gemini, 2M cap). Copy each trace to `public/learn/<runId>/` with screenshots re-encoded to WebP ≤ 60 KB each (a `node` script using an existing dependency or Playwright to re-encode), and a `run.json` that merges the header, the turns, the final grade summary (catalog recall, orders correct / safe refusal / unsafe) and the source file paths. Keep each run ≤ 5 MB.
2. **`/learn`** (index): "Watch KIBO learn a kiosk it has never seen." One sentence on how (Gemini explores the screens once, writes a skill, must pass self-tests and a coverage audit, then orders replay without AI), the honest limits in one line (web kiosks; synthetic kiosks built by other AI agents for the test), and a card per run (kiosk name, minutes, turns, items found, orders result with unsafe count).
3. **`/learn/[runId]`** (viewer): a timeline player: the kiosk screenshot large on the left; on the right the current action in plain words ("Tapped 콤보 → opened 3-step combo builder"), a running "What KIBO knows" panel (categories, items, option groups counters with the latest additions), and milestones on the timeline (first item recorded, all categories visited, self-test 3/3 passed, coverage audit ok, finish). Controls: play/pause, speed 1×/4×/16×, step back/forward, jump to milestone; keyboard accessible; reduced motion → no auto-advance animation, manual stepping only. At the end: the learned skill summary (the catalog table from the skill) and **[Order on this kiosk]** linking to `/demo?k=<kioskId>` when the kiosk is in the product (Doughhouse always; a blind kiosk only if step 7 adds it — otherwise hide the button and say why). Every number links to its file path in small text (R-001).
4. Links: landing ("Watch KIBO learn a new kiosk" in the "Works with kiosks that exist" section), `/demo` Doughhouse place card ("How KIBO learned this kiosk"), and D3's end card for learned kiosks.
5. Tests: unit tests for the trace → timeline transform (milestones, counters); E2E: `/learn` lists the runs, the viewer steps forward and reaches the finish milestone, the order button routes correctly; QA: `/learn` and the viewer at 1440×900, 1280×720 and 390×844 (the viewer stacks vertically on phones).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; fix H failures on the new pages.
2. Check: the replay shows only what the trace recorded (no invented steps), no prompts or model reasoning text, no secrets; the sizes stay within the limits.
3. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not fake or edit the trace to look better; skip boring turns only with a visible "skipped N similar steps" marker.
- Do not run the learner from the product (no browser on Cloud Run, cost).
- Break existing tests.
