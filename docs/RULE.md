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

### R-015 (proposed): Check every name, mark and picture a screen shows against real brands before it ships, not only text
- From: `third-party-brand` — I-009 (seen 10-12/session), I-107 (10-13/7-environments:2), I-217 (10-14/14-final:2)
- Why: real names slipped into docs and data twice, then a logo shape (a capital M on a gold tile beside burgers) recalled a real chain; third-party IP disqualifies the entry, and the name tests in `catalog.test.ts` cannot see a shape or a colour.
- Check: names and taglines pass the real-brand list in `src/lib/adapters/catalog.test.ts`; for each new or changed mark, logo, hero or menu picture, the step's QA report says what it shows and that it uses no single capital letter on a coloured tile, no real product shape or packaging and no real store screen (UI_QA "Kiosk mark").

### R-016 (proposed): A rule that refuses kiosk labels matches whole labels or whole words, and its tests include real choices that contain the refused text
- From: `label-rule-false-positive` — I-300 (seen 10-14/13-blind-kiosks:8 on bk5, 10-14/session on bk7 and on bk8, round 3)
- Why: the option-name lint refused real customer choices (`0%`–`100%` for having no letter; `곱빼기` for ending in the stepper word `빼기`), and each time the learner worked around it by renaming the option (`곱배기`), dropping it, or tapping one choice in its recipe for every customer; the same kind of substring match refused `계속 주문하기` as a payment button (I-193).
- Check: a change to `isControlLabel`, `isForbidden` or any label word list in `spikes/kibo-learn/` adds test cases where the refused word sits inside a real choice or control (`곱빼기`, `계속 주문하기`, digits-only names such as `0%`, `2`) next to the cases it must still refuse; `node --test spikes/kibo-learn/patterns.test.mjs` passes.

### R-017 (proposed): Parse a Google API reply by its documented structure, test the real reply's shape, and regenerate anything built from it when the parser changes
- From: `unchecked-upstream-shape` — I-058 (seen 10-13/3-assistant:2), I-124 (10-13/8-scenarios:0), I-237 (10-14/14-final:7)
- Why: Gemini replies changed shape under us three times (a candidate with no `parts`, TTS audio in a WAV header, a `C2PA` chunk after the audio), and each time code that read the reply as the shape it once had produced a 500 or a click and a noise burst, and the committed fixtures kept the fault after the parser was fixed.
- Check: code that reads a Gemini reply (`src/lib/agent/model.ts`, `scripts/wav.ts`) has a test with the reply's current shape (missing fields, header, trailing chunk); artifacts made from replies have a check on the artifact itself (`npx vitest run scripts/fixtures.test.ts` for `e2e/fixtures/*.wav`), and a parser fix in the same change regenerates them.

### R-018 (proposed): Keyboard focus inside a scroll area stays fully visible while anything beside it appears, goes or changes size; prove a fix with a repeated run
- From: `flaky-qa-state` — I-220 (seen 10-14/14-final:2, 10-14/14-final:4, 10-14/14-final:10)
- Why: the phone's cart summary pill and dock take height from the scroll area, and three times a QA state failed "focus obscured" in some runs only, so each pass looked like a flake while a keyboard user really saw the focused control covered.
- Check: a change to anything placed beside `[data-phone-scroll]` (summary, dock, banners) keeps the `Scroll` focus rule in `src/components/assistant/AssistantPanel.tsx`, and the QA state that shows it passes `npx playwright test -c playwright.qa.config.ts <spec> -g <test> --repeat-each 6`; a "focus obscured" H that passes on rerun is a bug, never a flake.

### R-019 (proposed): A hint or one-line label on the phone fits at 320 px wide in Korean with larger text, or is shortened
- From: `truncated-copy` — I-133 (seen 10-13/8-scenarios:4, 10-13/9-polish:6, 10-14/14-final:10)
- Why: the text-field hint was cut three times ("…City Cent", "e.g. One cheesebu", "예: 치즈버거 세"), each fix checked one width or one language, and a cut hint reads as broken to the older users the phone is for.
- Check: for each placeholder or one-line label a step adds or changes on the phone, look at its `*-320x700.png` QA screenshot in Korean with larger text (`P3-typing-ko-large`) and in English; `e2e/flow-polish.spec.ts` measures the hint's width against its field (extend it to 320×700 when the hint changes).

### R-020 (proposed): Every reply path follows the language of the user's own words; test each one with a message in a language other than the screens'
- From: `wrong-reply-language` — I-256 (seen 10-15/15-judge-fixes:0), I-269 (10-15/15-judge-fixes:6), I-271 (10-15/session)
- Why: three times a reply path answered in the screens' or the picker's language instead of the user's (the server's time-budget summary, a reply with the picker on Spanish, Live voice and choice taps on English screens), and "your language" is a headline promise to the Korean persona aged 72.
- Check: a change to a reply path (`src/lib/agent/chat.ts`, `quickReply.ts`, `instructions.ts`, `ownWords.ts`, `live.ts`, `src/components/phone/Choices.tsx`) keeps or adds a unit test with a Korean message on English screens and one with an AI-only picker language; `npm run eval:agent -- l-ko-on-en-tap l-ko-voice-like-en` passes with every `replyLanguages` entry `ko`.

### R-021 (proposed): Evidence files change only with `EVIDENCE=1`, and in the same commit as the NUMBERS.md update they cause
- From: `evidence-overwrite` — I-070 (seen 10-13/3-assistant:5), I-099 (10-13/6-learn:3, 10-15/16-judge-r3-fixes:0); `number-drift` — I-238 (10-14/14-final:7, 10-15/15-judge-fixes:3, 10-15/16-judge-r3-fixes:2)
- Why: test and QA runs rewrote cited evidence files and broad staging committed them, so the files and every published surface disagreed, which judges check first because the pitch is "every number has an evidence file".
- Check: a spec or script that measures writes through `evidencePath` (`scripts/evidencePath.ts`), so it reaches `evidence/` only with `EVIDENCE=1`; `npm run test` runs `scripts/numbers.test.ts`, which recomputes the voice, bridge and typed-latency values from `evidence/` and fails when `docs/plan/NUMBERS.md` disagrees; a commit that changes a file in `evidence/` also changes `docs/plan/NUMBERS.md` (`git diff --cached --name-only`).

### R-022 (proposed): A line that says what happens next follows every step the screen beside it shows, including steps only that screen knows
- From: `stale-status` — I-144 (seen 10-13/10-assets:0), I-242 (10-14/14-final:8), I-306 (10-15/session)
- Why: three times a KIBO line kept naming a step the user had already done (the scenario guide's "Your turn" after payment and after [Yes, pay now], the kiosk step line's receipt question under the order number), because it followed the session status alone and the status does not change at every step a person sees.
- Check: a step or status line has a unit test with one case per screen it can sit beside, including the last one of the flow (`kioskStep` in `src/lib/kiosk/pairing.test.ts`; the "Your turn" lines in `e2e/demo-scenarios.spec.ts`); the QA walk reads the line at D3 after the order number shows.
