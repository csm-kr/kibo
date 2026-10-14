# Orchestrator handoff (updated 10-14 13:35 KST, before a low-battery stop)

The orchestrating session has run `/harness` since 10-12 22:30. The user delegated all decisions ("don't ask, decide; keep going") except things only a person can do (payments, logins, publishing). Reply to the user in Korean, short, conclusion first; numbers only with their evidence file (R-001). The user is often on battery: check `pmset -g batt` first and warn early.

## State at 13:35
| Track | State | Where |
|---|---|---|
| Phases 1–13 + stream hotfix | merged, **deployed** as `kibo-00014-859` (10-14 08:37); `main` = `d263983` | production URL below |
| Phase 14 `14-final` | **steps 0–5 completed** (kiosk-english, flow-polish, kiosk-polish, learn-visible, any-language, fast-feel); **chain stopped on purpose at 13:27** at the start of step 6 (low battery, clean boundary); steps 6–10 pending; tree clean on `feat-14-final` (`8a89538` + this handoff) | `phases/14-final/index.json` summaries, screenshots `phases/14-final/qa/` |
| KIBO Learn round 3 | done, **not merged** (branch `learn-r3`, worktree `.claude/worktrees/learn-r3`, head `b349747`) | `spikes/blind-kiosks/ROUND3.md` there |
| KIBO Learn round 4 | in progress or just stopped (branch `learn-r4`, worktree `.claude/worktrees/learn-r4`; first commit `a9522a4`); told at 13:27 to commit and write a `ROUND4.md` status, no new runs | `spikes/blind-kiosks/ROUND4.md` there |
| Fresh kiosks for round 4 | **sealed, not yet learned**: `bk9-bunsik`, `bk10-chicken` (built 10-14 by independent agents, self-checks pass) | `/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/5e4077f3-a03e-418a-bb20-c3c1f77daf49/scratchpad/sealed/` (a copy is in `videos/orchestrator/sealed-r4/`, git-ignored; never open them in a learner session) |
| Deck | on the **official template** (required, disqualification risk), 23 pages, 2.2 MB | `videos/deck-final/kibo-deck-final.pdf`, `CHANGES.md` (TODO list) |
| Video v2 | pre-production done: animatic 2:38.9 with footage placeholders, −14 LUFS | `videos/submission-v2/out/animatic-v2.mp4`, `PREPRO_REPORT.md` §5 (re-render commands), `STORYBOARD.md` (footage slots F01–F17) |
| Win plan + gate | verified rules, wow points → app/video/deck, Ask-the-Expert questions, pre-submission checklist | `docs/plan/WIN_PLAN.md`; research `videos/orchestrator/research-10-14/` |

Production: `https://kibo-407514467119.asia-northeast3.run.app` (`kibo-00014-859`), voice relay `kibo-voice-00002-xfv` (`wss://kibo-voice-407514467119.asia-northeast3.run.app/ws`), short address `https://kibo-2026.web.app` (Firebase Hosting redirect). Models: `gemini-3.8-flash` (text, learner), `gemini-3.8-live` (voice); no retirement risk during judging (2.5 models retire 10-20, not used).

## KIBO Learn numbers so far (all `grade-v2.json`, grader v2 + round-3 rules)
- Four test kiosks (learner tuned on them): baseline 5/10/5 → final 31/4/5 of 40 (phase 13).
- Fresh hold-outs, round 2 learner (phase 13): bk5-restarea 4/3/3, bk6-themepark 10/0/0.
- Round 3 informed (learner changed after seeing them): bk2 **10/0/0** (was 5/0/5; I-194 fixed), bk5 4/3/3 (unsafe = a take-out bag option the skill format cannot express; I-195's cause corrected), bk6 10/0/0 (skill-total errors 4→2).
- Round 3 fresh (learning logic `ea28477`; rules pre-registered `f45f071` before the runs): **bk7-bubbletea 0 correct / 10 safe refusal / 0 unsafe** (items 31/31, prices 31/31; the skill left out the required sweetness choice), **bk8-tableorder not learned** (attempt 1 killed at 30 min in parallel with Vertex 429s, attempt 2 alone hit the 2M token cap). Nothing ordered wrong. Both attempts reported.
- Honest headline today: on every never-seen kiosk since round 3, nothing was ordered wrong; correctness on new kiosks is the open weakness. Round 4 targets it.

## Next steps, in order
1. **Power first.** `pmset -g batt`; if on battery below 30 %, do not start heavy work (harness e2e/qa, learning runs, renders).
2. **Round 4 learner.** Read `learn-r4`'s `ROUND4.md`. If not frozen, resume the round-4 work (fixes: required choices must be option groups, order-changing popups modelled, no wasted turns; informed reruns bk7, bk8, Doughhouse; freeze with a hash). Then copy `sealed/bk9-bunsik` and `sealed/bk10-chicken` into `learn-r4`'s `spikes/blind-kiosks/`, pre-register any grading rule they need in `ROUND4.md` and commit **before** learning, learn each **once, one at a time** (wrapper `scratchpad/run-learn.mjs`, copy it to point at the learn-r4 learner; `gemini-3.8-flash`, 2M cap, 30 min kill, `TRACE_DIR`), grade (`node spikes/blind-kiosks/grade/grade.mjs <kioskId> <skill.json> --label final --out grade-v2.json`), report whatever comes out.
3. **Resume phase 14** (on power): `HARNESS_TIMEOUT=3600 HARNESS_MAX_TURNS=300 sh .harness-logs/chain.sh 14-final > .harness-logs/chain7.log 2>&1` in the background; it starts at step 6 (completed steps are skipped). Steps 6, 7, 9 carry orchestrator notes (prior art iCOMSYS, privacy wording, law wording, NUMBERS.md, forged-command evidence, shared-address check, language claims, README claim→code table). Watch each step; look at screenshots after UI steps; re-arm the step monitor every 30 min.
4. **Merge** `learn-r3` then `learn-r4` into `feat-14-final` after phase 14 (or between steps with the chain stopped): renumber their `docs/ISSUE.md` rows (r3 used I-210–I-215, which phase 14 also used; r4 uses I-300+), port the product-bridge proposals in `ROUND3.md`/`ROUND4.md` only if small and tested (the full-label payment-word rule from `plan.mjs` into `src/lib/adapters/learned.ts` is the important one), add a fresh round-4 run to `/learn` if it is good (`npm run learn:runs`), update RESULTS and NUMBERS.
5. **Deploy** app **and** voice relay together (phase 14 step 4 changed both schemas, I-227): `sh scripts/deploy-voice.sh`, then from the clean deploy worktree `SHORT_APP_URL=kibo-2026.web.app VOICE_RELAY_URL=wss://kibo-voice-407514467119.asia-northeast3.run.app/ws sh scripts/deploy.sh`; trust only `DEPLOYED <rev>`; check `/api/health?deep=1`, `/demo`, `/learn`, a phone pairing; `git branch -f main feat-14-final`.
6. **Deliverables in parallel (independent agents):** video v2 final (capture footage slots from production per `STORYBOARD.md`, headed Chromium for Live audio; human shots F01/F14 if the user sends them); deck final pass (`videos/deck-final/CHANGES.md` TODOs: new screenshots incl. the new MALO mark, NUMBERS.md values, round-4 results, links, privacy wording on page 06); a fresh 3-judge review on the deployed build, then fix what they find.
7. **Gate** `docs/plan/WIN_PLAN.md` §7 before submitting on 10-17. Code freeze 10-16 12:00 KST.

## Deploy procedure (never from the live harness tree)
Clean worktree `/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/5e4077f3-a03e-418a-bb20-c3c1f77daf49/scratchpad/deploy` (if /tmp was cleared: `git worktree add <new dir> <commit>`). `git checkout -q -- . && git checkout -q --detach <commit>`, `npm ci` (real node_modules, never a symlink), then the deploy line above. `--set-env-vars` replaces all env vars, so always pass `SHORT_APP_URL` and `VOICE_RELAY_URL`.

## Verified contest facts (10-14, Aside read of the logged-in dashboard)
Deck must use the official template (`videos/orchestrator/template/`); video strictly under 3:00; description ≤ 1,024 chars naming Firebase, Firestore, Cloud Run, Gemini; the deployed app is judged as-is 10-19 → 11-06 with no retries; challenge = Sustainability & Social Impact; deadline 10-19 03:29 KST; Ask-the-Expert 10-15 17:30–18:30 KST; close prior art (iCOMSYS patent 2026-03) so never claim "first"; Vertex Live's language list has 24 languages and no Chinese (`docs/plan/SOURCES.md` G1b).

## User decisions and constraints
- Product AI stays Gemini; GPT/Azure only for development. Published learning runs use Gemini.
- Local `.env` has `GEMINI_TEXT_BACKEND=vertex` (harness never spends the AI Studio key; balance ~₩99k, auto top-up off). Voice falls back to the Vertex relay (ADR-012).
- Budgets: two GCP budgets of ₩100,000, alert only.
- Video feedback: no crackle; polished kiosks (done in step 2: MALO mark redrawn, Doughhouse restyled); not Korean-only (9 AI languages, step 4); tall kiosk with one QR (done in step 1); keep the architecture chapter; numbers consistent.
- `caffeinate -ims -t 172800` (pid 96980) prevents idle sleep only; a flat battery still sleeps the Mac (processes freeze and resume on wake).

## Waiting on people
Real phone shots F01 (3–6 s, phone in hand + tall kiosk, the two customer lines) and F14 (larger text + screen reader) by 10-16 morning; Ask-the-Expert attendance 10-15 17:30 KST (questions in WIN_PLAN §6); a real-user test (even 3 people: 60+ or non-Korean readers, time + one quote, consent); team roles on the deck cover (assumed: Sungmin Cho product and engineering, Ye Seul Ahn research and user testing); approval to publish the GitHub repo, YouTube upload, and pressing submit (10-17).
