# Step 3: learn-visible

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN, UX (Flow C, learned states), UI_GUIDE, UI_QA.
- `docs/plan/judges/JUDGE_QA.md` rows B4–B6; `docs/plan/judges/ux/REPORT.md` fix 3 and walk log d; `docs/plan/judges/tech/REPORT.md` question 6.
- Phase 13's summaries (`phases/13-blind-kiosks/index.json`), `spikes/blind-kiosks/RESULTS.md`, the `/learn` pages it built; code: `src/app/learned/*`, `src/components/learned/*`, `src/lib/bridge/*`, `/demo?k=doughhouse`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
KIBO Learn is the most novel part (Innovation 25%), but on screen the learned kiosk renders at 0.56× (text ≈ 9 px), the replayed taps are invisible, `/learned/doughhouse` has no English explanation, and "Done on the kiosk" appears about 3 s before the cart is verified. Judges also asked how the bridge reaches a real vendor's kiosk.

## Task
1. **Readable kiosk:** in `/demo?k=doughhouse` and `/learned/doughhouse`, scale the learned kiosk to fit the available height (≥ 0.8× at 1440×900 where possible) or zoom to its active region; text ≥ 14 px effective.
2. **Visible replay:** draw a tap ripple and a step number at each replayed click (from the bridge's replay events), and a caption when done: "KIBO tapped 페퍼로니 → 라지 → 씬 → 베이컨 · 4 taps · kiosk total 23,400원 ✓ matches". Only show "Done on the kiosk" after the bridge verified the kiosk total (or say plainly when it could not).
3. **`/learned/doughhouse` header (English + Korean):** "A pizza kiosk KIBO learned by itself (our development kiosk). Scan or enter the code to order by talking." + the 6-digit code + a link to `/learn` ("Watch how KIBO learned it").
4. **How it gets onto a real kiosk:** a short section on `/learn` (and README later) — direct adapter from menu data today; web kiosks: one script tag added by the vendor or operator, a kiosk-browser extension, or WebView injection; native apps: roadmap. No claims of partnerships.
5. **`/learn` polish (orchestrator, from phase 13 QA screenshots):** the run cards' kiosk thumbnails are tiny and unreadable (a whole kiosk shrunk into ~200 px); show a cropped, legible moment instead (the item sheet or the category screen at ≥ 1:2 scale). The replay's number cards print long monospace file paths in the body; move sources to one small grey footnote line per card (still linking to the files). A trace shows the kiosk as it looked when it was learned, so never swap its images. If the Doughhouse card should show the restyled kiosk from step 2, record **one new** traced Doughhouse learning run on the restyled kiosk (Gemini, cap 1M input tokens, `TRACE_DIR`), check its skill still replays the run 3 holdout 4/4, and publish that run with `npm run learn:runs`; otherwise keep the old trace and label it with its date.
6. Tests for the replay-event → overlay transform; QA screenshots at 1440×900 and 1280×720.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; 0 H on changed screens.
2. Check: the overlay shows only taps the bridge really replayed (no animation of steps that did not happen).
3. Update this step in `phases/14-final/index.json`.

## Do not
- Do not change the learner or the skill format.
- Break existing tests.
