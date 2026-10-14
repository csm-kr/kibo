# Orchestrator handoff (updated 10-14 ~08:45 KST)

The orchestrating session has run `/harness` since 10-12 22:30. The user delegated all decisions ("don't ask, decide") except things only a person can do (payments, logins, publishing). Reply to the user in Korean, short, conclusion first; numbers only with their evidence file (R-001).

## State
| Phase | Status | Notes |
|---|---|---|
| 1-core … 12-phone-app | completed, deployed | `main` = 12-phone-app (`c72f7e4`) |
| hotfix `hotfix/stream-limits` (`65b118c`, off `c72f7e4`) | **merged** into 13-blind-kiosks as `ea164fe` (10-14 08:35; its I-189 row became I-206) | per-address limits 10→40 streams, 60→240 api/min; stream retry with "Busy right now. Reconnecting…"; worktree `.claude/worktrees/agent-af2b661da01baf837`. Merge into the phase 14 base before phase 14 runs (expect a `docs/ISSUE.md` conflict: it added I-189 while phase 13 also used I-18x/I-19x → renumber the hotfix row) |
| 13-blind-kiosks | **completed 10-14 08:10** (`177c62c`); merge commit `ea164fe` **deployed as `kibo-00014-859`** (10-14 08:37; deep health all ok, `/learn`, `/demo`, `/kiosk` 200; `main` = `d263983`) |
| 14-final | **running** from 10-14 08:35 (`.harness-logs/chain6.log`, `.harness-logs/14-final.log`) on `feat-14-final` off `ea164fe` | steps 3, 7, 8 carry orchestrator notes from phase 13 |

Production: `https://kibo-407514467119.asia-northeast3.run.app` (`kibo-00014-859` = phase 13 + stream hotfix), voice relay `kibo-voice-00002-xfv` (`wss://kibo-voice-407514467119.asia-northeast3.run.app/ws`), short address `https://kibo-2026.web.app` (Firebase Hosting redirect; `firebase.json`; REST deploy script `videos/orchestrator/hosting-redirect.sh`). Deep health all ok after the AI Studio top-up.

## Phase 13 results so far (`spikes/blind-kiosks/results/`)
- Baseline (end-of-phase-12 learner + crash fixes): 2/4 learned, items 57/134, orders 5 correct / 10 refused / 5 unsafe of 40 (`BASELINE.md`).
- Final (after step 4, patterns from the 4 test kiosks): bk1 6/4/0, bk2 5/0/5, bk3 10/0/0, bk4 10/0/0 → 31/4/5 of 40, items 134/134, 8–13 min and 0.44–0.98M input tokens each, 40–62% cached (`*/final/`).
- bk2 rerun after the I-193 fix (labelled "informed by bk2", shown next to final): 6/0/4; the other 4 come from a mid-line "계속 주문하시겠어요?" modal (I-194, open).
- Fresh hold-outs (built by separate agents, added after the learner fixes): bk5-restarea 4/3/3 (items 31/31); bk6-themepark **10/0/0 with grader v2** (`grade-v2.json`; v1 graded 0/0/10 because it read category tabs as cart lines, I-183 fixed in the grader only). Full write-up: `spikes/blind-kiosks/RESULTS.md`.
- Learning cost (orchestrator arithmetic: learn-stats × official prices in `evidence/cost-per-order.json`): finals $0.25–0.53 each; becomes `evidence/learn-cost.json` in phase 14 step 7.

## Next steps, in order
1. (done 08:10) Watch phase 13 to the end (`pgrep -fl chain.sh`; `.harness-logs/chain5.log`, `.harness-logs/13-blind-kiosks.log`; summaries in `phases/13-blind-kiosks/index.json`). After a Mac sleep the chain resumes by itself; a step killed at the 60 min limit retries (steps carry "if this is a retry" guidance).
2. (done, `ea164fe`) Merge `hotfix/stream-limits` into `feat-13-blind-kiosks` (resolve `docs/ISSUE.md`: renumber the hotfix's I-189 row if taken), run `npm run lint && npm run build && npm run test`, commit.
3. (done, `kibo-00014-859`) Deploy that merge commit from the clean worktree (below), check `/learn`, `/demo` and deep health, `git branch -f main feat-13-blind-kiosks`.
4. (started) Add `{"dir": "14-final", "status": "pending"}` to `phases/index.json`, then in the background `HARNESS_TIMEOUT=3600 HARNESS_MAX_TURNS=300 sh .harness-logs/chain.sh 14-final > .harness-logs/chain6.log 2>&1`. Phase 14 reads `docs/plan/judges/*` and `docs/plan/SOURCES.md` (already in the repo). Watch each step, look at screenshots after UI steps.
5. After phase 14: deploy (`sh scripts/deploy-voice.sh` only if `voice-relay/` changed; then `SHORT_APP_URL=kibo-2026.web.app VOICE_RELAY_URL=wss://kibo-voice-407514467119.asia-northeast3.run.app/ws sh scripts/deploy.sh`), check, `main` → phase 14.
6. Deliverables (pre-production started 10-14 08:40 by two independent agents, working only in `videos/submission-v2/` (animatic, script, music, narration, `PREPRO_REPORT.md`) and `videos/deck-final/` (content pass, `CHANGES.md`)): video v2 per `videos/submission-v2/PLAN.md` (rev. 2; `.claude/skills/motion-demo-video/`; capture from the live URL, headed Chromium for Live audio); deck final pass per `videos/deck-v2/NOTES.md` TODOs; a second judge round (3 fresh judge agents on the deployed build); code freeze 10-16 12:00; submission 10-17.

## Deploy procedure (never from the live harness tree)
Clean worktree `/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/5e4077f3-a03e-418a-bb20-c3c1f77daf49/scratchpad/deploy` (if /tmp was cleared: `git worktree add <new dir> <commit>`). `git checkout -q -- . && git checkout -q --detach <commit>`, `npm ci` (real node_modules, never a symlink), then the deploy line above; trust only the last line `DEPLOYED <rev>` / `DEPLOY FAILED`. `--set-env-vars` replaces all env vars, so always pass `SHORT_APP_URL` and `VOICE_RELAY_URL`.

## User decisions and constraints (10-13/14)
- Product AI stays Gemini (contest rules); GPT/Azure only for development. Learner dev runs used `PROVIDER=openai`; published learning runs use Gemini.
- Local `.env` has `GEMINI_TEXT_BACKEND=vertex` so harness runs never spend the AI Studio prepaid key (topped up KRW 100,000 on 10-14, auto top-up off). Voice falls back to the Vertex relay when the key fails (ADR-012).
- Budgets: "KIBO monthly 50k KRW" raised to KRW 100,000 (alert only) + "KIBO monthly 100k KRW alerts"; Artifact Registry keeps the last 5 images, deletes older than 7 days. Backup Mastercard is fine (user).
- Video feedback: remove crackle (done in v1.1); kiosk quality must improve (pizza unfinished, burger too); stop emphasizing Korean only (any language via Gemini; Gemini Live lists 99 languages, claim only what we tested); tall kiosk with one QR; keep the architecture chapter; align numbers like "3 vs 24".
- Caching is on (text agent explicit cache; learner block pruning for the implicit cache).
- The Mac sleeps on low battery (23:32–05:32 on 10-13/14 cost 6 h): `caffeinate -ims -t 172800` runs; keep it on power.

## Key documents
- **Win plan and pre-submission gate (10-14):** `docs/plan/WIN_PLAN.md` (verified rules, wow points → app/video/deck, Ask-the-Expert questions, checklist). Research reports: `videos/orchestrator/research-10-14/`. Official deck template: `videos/orchestrator/template/`.
- **KIBO Learn round 3 (10-14):** worktree `.claude/worktrees/learn-r3` (branch `learn-r3`): general learner fixes (I-194/I-195/I-197) + informed reruns, then two new blind kiosks built by independent agents in `scratchpad/sealed/{bk7-bubbletea,bk8-tableorder}` are copied in and learned once with the frozen commit (orchestrator does this; protocol in `spikes/blind-kiosks/ROUND3.md`). Merge `learn-r3` after phase 14.
- Judge reviews and Q&A matrix: `docs/plan/judges/` (tech 7.4, impact 6.25, UX 7.9 of 10).
- Sourced facts: `docs/plan/SOURCES.md` (English); Korean research notes `videos/orchestrator/SOURCES-research-ko.md`.
- Expert reviews: `videos/deck-v1/EXPERT_REVIEW.md` (deck 6/10), `videos/submission-v1/EXPERT_REVIEW.md` (video 6/10).
- Deliverables: deck v2 `videos/deck-v2/kibo-deck-v2.pdf` (+ NOTES.md TODOs); video v1.1 `videos/submission-v1/out/kibo-submission-v1.1.mp4` (`video-*.mp4` there are silent intermediates); video v2 plan `videos/submission-v2/PLAN.md`; phase 14 drafts backup `videos/orchestrator/phase14-draft-backup/`.

## Waiting on people
Real phone shot (3 s, by 10-16 morning; video plan §3); real-user test (5 people 60+, 3 non-Korean readers); the official Hack2skill deck template; team roles on the deck (assumed: Sungmin Cho product and engineering, Ye Seul Ahn research and user testing); approval to create the public GitHub repo; YouTube upload and the submission form.
