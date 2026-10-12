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
