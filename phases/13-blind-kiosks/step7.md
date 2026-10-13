# Step 7: forbidden-fix

## Read first
- `spikes/blind-kiosks/PROTOCOL.md`, `spikes/kibo-learn/CHANGES.md`, the summaries of steps 4–6 in `phases/13-blind-kiosks/index.json`, issue I-193 in `docs/ISSUE.md`, `spikes/blind-kiosks/results/bk2-bakery/final/notes.md`; code: `spikes/kibo-learn/{driver,runner,audit,learner,lint}.mjs` (FORBIDDEN_WORDS and every place that refuses a label), `spikes/blind-kiosks/grade/`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
I-193: the step-4 safety rule refuses any label that **contains** a payment word, so a kiosk's "계속 주문하기" (continue ordering) button on an inactivity modal was refused; long orders on bk2-bakery stalled mid-replay and counted as 5 unsafe. The owner asked (10-14) to fix it. The fix is informed by a test kiosk, so: the fresh kiosks (bk5, bk6, step 8) have **not** been run yet and remain a clean hold-out for the fixed learner; reruns of bk1–bk4 after this fix are labelled "after the I-193 fix, informed by bk2" and never replace their `final/` results.

## Task
1. Tests first (AI-free, on dev fixtures): add a synthetic fixture under `spikes/kibo-learn/fixtures/patterns/` with an inactivity modal whose only button is "계속 주문하기" and a checkout button "주문하기", plus English variants ("Continue ordering" vs "Order now"/"Pay"); assert the driver/runner/audit accept the continue button and still refuse checkout/payment labels.
2. Replace substring matching with a label classifier used everywhere (one function): a label is forbidden when, after trimming spaces and symbols, it **is** a payment/checkout action (exact list: 주문하기, 결제하기, 결제, 카드결제, 간편결제, 주문완료, 구매하기, Pay, Checkout, Place order, Order now, …) or **starts with** 결제 / Pay, or is in the skill's `forbiddenLabels`; labels containing 계속 / 더 담기 / 취소 / 이전 / Continue / Back / Cancel are never forbidden by the word rule. Keep the runner's "refuse a forbidden plan before opening the kiosk" behaviour.
3. Re-run the full learner regression tests and the dev-set checks from step 4 (no new learner runs on the dev set unless a test needs one; at most one Gemini run on Doughhouse, cap 1M).
4. **Labelled reruns:** run the improved learner once on `bk2-bakery` (and on any of bk1/bk3/bk4 whose `final/notes.md` names I-193 as a cause) into `results/<kioskId>/final-after-fix/` with a trace, in parallel, 30-min kill each; grade them. Do not touch `final/`.
5. Update `PROTOCOL.md` ("I-193 fix" section: what changed, why, which results it affects, that bk5/bk6 run after it), `CHANGES.md`, I-193 (fixed, with test names).

**Time limit:** the session is killed after 60 min and retried; on a retry, do not start a run whose `final-after-fix/learn.log` exists; wait for a running learner (kill only after 30 min).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
plus the learner tests (name the commands in the summary).

## Verify
1. The new tests failed before the change and pass after; `final/` folders are unchanged (`git diff --stat` shows no change under any `final/`).
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary with the reruns' numbers / error / blocked).

## Do not
- Do not open `spikes/blind-kiosks/bk5-restarea/` or `bk6-themepark/` (fresh hold-out).
- Do not change anything else about how the learner explores.
