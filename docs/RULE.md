# Rules from repeated issues

When an issue class in `docs/ISSUE.md` is seen for the **3rd time**, it becomes a rule here. One slip is bad luck, three is a habit, and a habit needs a written rule and a check. These rules bind like `CLAUDE.md`. A rule added by a harness session is marked `(proposed)`; it is followed until the user accepts it (remove the mark) or rejects it. Remove or relax a rule only with the user's consent.

## How to add a rule
1. Give it the next id and one imperative line saying what to do.
2. Link the issue ids and the dates it was seen.
3. Say why in one sentence.
4. Give a check: a command, or the exact thing to look at during a QA pass.
5. Write the rule id in the `Rule` column of every linked issue row.

```markdown
### R-001: <what to do, one line>
- From: I-00x (seen 10-12/session, 10-14/1-mvp:3, 10-15/2-voice:qa)
- Why: <one sentence>
- Check: <command or concrete look>
```

## Rules

### R-001: Every number or capability claim names its evidence; anything unchecked says "unverified"
- From: `unverified-claim` — I-010, I-014, I-018 (also I-021), all seen 10-12/session
- Why: three times in one day docs stated more than the evidence showed (public judging, cited standard values, replay speed and kiosk features), and judges and the T&C punish overclaiming.
- Check: for each number, limit or "supports X" added or changed, the same sentence or table row cites a result file in the repo, an official URL, or the word "unverified". Reviewers grep the diff for numbers without one.

### R-002 (proposed): When a contract changes, update every doc that states it in the same change
- From: `contract-drift` — I-017 (seen 10-12/session), I-024 and I-025 (seen 10-12/1-core:2), I-026 (10-12/1-core:3), I-030 (10-12/1-core:5)
- Why: state rules, actors, fields and id formats are restated in ARCHITECTURE, ADRs, SECURITY, UX and step files, and each change left some copies stale, so build steps code against conflicting contracts.
- Check: for each command, field, state or id format a change touches, `grep -rn "<name>" docs/ phases/` and confirm every hit says the same thing as the code.

### R-003 (proposed): A step that adds a page, screen or state adds it to the UI QA specs in the same step
- From: `qa-coverage-gap` — I-049 (seen 10-13/2-kiosk:6), I-065 (10-13/3-assistant:3), I-071 (10-13/3-assistant:6)
- Why: states and pages left out of `e2e/qa/*.qa.spec.ts` (kiosk banners, Korean phone copy, the root page) get no screenshots or checks, so the phase-end QA passes without ever measuring them.
- Check: for each route or screen-map id (`docs/UX.md`) the step adds or changes, `grep -rn "<id or route>" e2e/qa/` finds a `qaState` call, and `phases/<phase>/qa/` holds its screenshot after `npm run qa:ui`.

### R-004 (proposed): Every QA report names which T misses are checker false positives, and each one has an issue row
- From: `checker-false-positive` — I-061 (seen 10-13/3-assistant:3), I-075 (10-13/3-assistant:6, 10-13/5-ship:3)
- Why: false positives from `e2e/qa/checks.ts` (screen-reader-only text, `auto` margins) come back on every run, and unexplained T noise hides the real misses.
- Check: in `phases/<phase>/qa/REPORT.md`, every kind of T miss in `ui-qa.jsonl` on a changed screen is either a real miss with an issue id or a false positive with an issue id (`grep checker-false-positive docs/ISSUE.md`).

### R-005 (proposed): Every Playwright spec that calls the API sends its own `X-Forwarded-For` address
- From: `shared-rate-limit` — I-068 (seen 10-13/3-assistant:4, 10-13/5-ship:1, 10-13/6-learn:2)
- Why: all specs share the dev server's per-IP limits (60 API requests and 10 new sessions a minute), so a new spec passes alone and fails the full run, or makes another spec fail.
- Check: `grep -L "X-Forwarded-For" e2e/*.spec.ts e2e/qa/*.qa.spec.ts` lists only specs that make few API calls; a new spec picks an unused `192.0.2.x` (`grep -rn "192.0.2" e2e/`).

### R-006 (proposed): A banner, pill or widget shown over a screen gets its own space, or the QA report names what it covers
- From: `overlay-covers-content` — I-045 (seen 10-13/2-kiosk:5, 10-13/2-kiosk:6), I-101 (10-13/6-learn:5)
- Why: overlays placed with `absolute` on top of content (AI pill, staff banner, the learned-kiosk widget in `/demo`) hid tiles the user or judge needs, and no automated check catches it because the covered controls stay partly visible or are not focusable.
- Check: on every QA screenshot that shows an overlay, look at what lies under it; if a tile, control or price is covered at any captured viewport, move the overlay into its own row or log it in `docs/ISSUE.md` with the screenshot name.

### R-007 (proposed): A step that adds a kiosk, or a new kind of kiosk data, walks every phone screen with that kiosk and checks each line of copy against its data and domain
- From: `wrong-kiosk-copy` — I-098 (seen 10-13/6-learn:3, 10-13/7-environments:4), I-114 (10-13/7-environments:5), I-116 (10-13/7-environments:6, kiosk copy too)
- Why: the phone was written for MALO, so a new kiosk (pizza, ticket machine) kept burger examples, a dine question and "we'll call your number at the counter", and no check failed because the words are valid English.
- Check: for the new kiosk, an E2E or QA spec reaches P2 (or its skip), P3, P4, P5 and P6 on the phone; read each screenshot and grep `src/lib/i18n/phone.ts` for food words (burger, cheeseburger, counter, eat) used on that kiosk's screens. The kiosk screens too: strings built outside `kt` (such as `receiptInSeconds`) must take the kiosk's domain; `src/lib/i18n/kiosk.test.ts` checks the ticket wording.

### R-008 (proposed): For every screen a step adds or changes, walk each UX flow and exception that passes through it to its end, and log a dead end or missing control
- From: `flow-gap` — I-048 (seen 10-13/2-kiosk:6), I-064 (10-13/3-assistant:3), I-095 (10-13/6-learn:2); counted 10-13/7-environments:6
- Why: screens were built one at a time from their own step, so a path the flows promise (small QR on every kiosk screen, checkout without the model, choosing a dine option after the first add) had no control on some screen, and no test walked that path.
- Check: the step's QA report names, per changed screen id, the flows and exception rows of `docs/UX.md` walked through it, and each missing control has an issue id.

### R-009 (proposed): On `/demo`, the confirm card's total and [Yes, pay now] stay on screen at 1440×900; anything added to the phone column gives way to them
- From: `below-fold-action` — I-073 (seen 10-13/3-assistant:6, 10-13/6-learn:3, 10-13/7-environments:6), I-129 (10-13/8-scenarios:3)
- Why: the judge's key moment is the confirm card, and each addition to the phone column (more lines, the learned end card, the action strip) pushed its total and pay button below the fold without any check failing.
- Check: `demo-D2-confirm-1440x900.png` (and the rail and learned variants) show the total and [Yes, pay now] without scrolling; a step that adds something to the phone column asserts `toBeInViewport()` on [Yes, pay now] in an E2E (as `e2e/demo-actions.spec.ts` does).

### R-010 (proposed): A QA check that changes the page (focus, scroll, injected CSS, media) puts it back before the next screenshot
- From: `qa-screenshot-artifact` — I-121 (seen 10-13/7-environments:6, 10-13/9-polish:6), I-138 (10-13/9-polish:0)
- Why: QA screenshots feed the deck and the video, and leftovers from the previous check (focus rings, scrolled containers, images not yet loaded) made them show states no user would see, such as a highlighted tile scrolled out of view.
- Check: a new check in `e2e/qa/checks.ts` restores what it changes (as `focus` restores scroll and `textSpacing` removes its style); after `npm run qa:ui`, the second and third viewport of a state show the same scroll position as the first (`demo-D3-done-*`, `kiosk-KX-staff-1080x1920.png`).

### R-011 (proposed): Measure the text agent's latency on the backend production uses, with parallel users, before claiming or deploying a change to its path
- From: `slow-text-agent` — I-059 (seen 10-13/3-assistant:2), I-105 (10-13/7-environments:0), I-157 (10-13/11-hardening:3)
- Why: each time the text agent was measured in a new setting (first real call, Vertex AI, five users at once) it was several times slower than the last number on file, and judges type on `/demo` when voice is down.
- Check: a step that changes the text agent's backend, model, instructions or cache cites per-request median and p90 from `npm run eval:agent` next to the previous run in the TESTING ledger, and before a deploy for judging `npm run load:check` reports the 5 parallel chat latencies in `evidence/load-check.json`; a value over 10 s gets an issue row.

### R-012 (proposed): Commit a step with explicit paths, and check what is staged before committing
- From: `broad-git-add` — I-035 (seen 10-12/2-kiosk:2, 10-13/2-kiosk:5, 10-14/13-blind-kiosks:6)
- Why: other sessions edit and stage planning files while a step runs, so `git add -A` or a bare `git commit` puts their work into the step's commit.
- Check: before the step commit, `git diff --cached --name-only` lists only the step's files; commit with `git commit <paths> -m …` so files staged by others stay out.

### R-013 (proposed): A third-party kiosk screen shown scaled down never carries meaning alone; KIBO's own readable text beside it says what it shows
- From: `unreadable-third-party-page` — I-096 (seen 10-13/6-learn:2, 10-13/10-assets:2), I-198 (10-14/13-blind-kiosks:9)
- Why: learned and recorded kiosk screens cannot be restyled, and each time one was shown smaller (the `/demo` iframe, a deck picture, the `/learn` replay) its own text dropped to 4–8 px.
- Check: on every QA screenshot or deck picture with a scaled kiosk page or recorded kiosk screenshot, the point it makes (what was tapped, what was added, what it learned) can be read from KIBO's text next to it at ≥ 16 px; if not, add a caption or log it with the screenshot name.

### R-014 (proposed): Wherever a learned skill's order results are quoted, also say how often its own total differed from the kiosk's; passing self-tests do not prove the option groups they never used
- From: `unexercised-option-group` — I-192 (seen 10-13/13-blind-kiosks:4), I-197 (10-14/13-blind-kiosks:8, 10-14/13-blind-kiosks:10)
- Why: three skills passed the finish gate with 3 of 3 self-tests, then failed or mispriced orders whose option groups no self-test had used (Doughhouse toppings, bk6 discounts, bk1 and bk2 prices), and the order counts alone hid it.
- Check: each blind-kiosk results table (`spikes/blind-kiosks/RESULTS.md`, `/learn` cards) shows the "skill total wrong" count from `skillPredicts` vs `kioskTotal` in `grade-v2.json`; a learner change to the gate on the dev set has a test with an option group the self-tests skip.

### R-015 (proposed): A rule that refuses kiosk labels matches whole labels or whole words, and its tests include real choices that contain the refused text
- From: `label-rule-false-positive` — I-300 (seen 10-14/13-blind-kiosks:8 on bk5, 10-14/session on bk7 and on bk8, round 3)
- Why: the option-name lint refused real customer choices (`0%`–`100%` for having no letter; `곱빼기` for ending in the stepper word `빼기`), and each time the learner worked around it by renaming the option (`곱배기`), dropping it, or tapping one choice in its recipe for every customer; the same kind of substring match refused `계속 주문하기` as a payment button (I-193).
- Check: a change to `isControlLabel`, `isForbidden` or any label word list in `spikes/kibo-learn/` adds test cases where the refused word sits inside a real choice or control (`곱빼기`, `계속 주문하기`, digits-only names such as `0%`, `2`) next to the cases it must still refuse; `node --test spikes/kibo-learn/patterns.test.mjs` passes.
