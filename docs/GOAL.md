# KIBO goal

Updated: 2026-11-26 · Next check: 2026-11-27 (bench results into the blog), 2026-11-29 (phone test), 2026-12-01 (freeze)

- **Readers:** every session and agent working on KIBO (before choosing work, and after finishing it), and the owner.
- **Purpose:** every task is chosen and judged against the same goal and number. The method is the `goal-lens` skill.

## 1. Goal

- **One sentence:** On 2026-12-04 in Singapore the judging panel watches KIBO's live demo work on the first try in a
  loud hall and ranks it first.
- **Why (asked twice):** The owner (11-22): "improve it so that this app is worth 10 million won or more and wins the
  AI Builder Cup." Why win: the contest is the launch point for a business (memory `kibo-business-goal`, 10-15). What
  that needs: an app that does its job for a stranger in a real, noisy place, not only in a recorded video.
- **How, stated by the owner (11-26 23:40):** "We want to speak without pressing and still be told apart well; that
  is the higher goal. We want first place." And the method: "the AI follows the flow of meaning, removes what does
  not belong, and selectively keeps what fits my flow of meaning." So no press is part of the goal, not an option;
  hold to talk is a safety net only; a headset or a closer microphone is not the answer being asked for.
  And on 11-27: "'Yes, please pay' by voice must work. The person only puts the card in. That is the point." So
  the whole order, the confirmation included, is spoken; the one physical act is the card. A tap on the confirm
  card stays possible but is never required.
- **Main number:** first-try orders on a real phone in a loud place, **without pressing to talk**: of 10 hero orders
  (pair by QR, speak, confirm, pay on the kiosk) by a person, how many finish with the right cart and no retry.
  Target 9 of 10 (proposed, not the owner's number). Judge: the owner's own phone test, not this session's browser.
- **Numbers read with it:** (a) tap on the mic to the moment the first word can be spoken, on the phone;
  (b) the last word to the kiosk highlight (`docs/plan/NUMBERS.md`).
- **Constraints:** the AI still cannot pay (CLAUDE.md); no claim without its evidence file; Gemini for every AI feature
  in `src/`; production changes and pushes only on the owner's word; nothing that can fail live is added after the
  12-02 freeze.
- **Ladder:** (1) fix what the owner reports; (2) remove the cause, so a first press, a loud room or a slow network
  cannot lose an order; (3) a judge drives it on their own phone and it still works. Chosen: (2), judged by the owner's
  phone tests; (3) only if (2) holds by 11-29.

## 2. Answer sheet (real outcomes only)

| ID | What was done | Result | Conditions | Source |
|---|---|---|---|---|
| A1 | Submitted the open-microphone app, deck and video (10-18) | Top 50 shortlist (owner, 11-13) | Judged online, no live room | memory `ai-builder-cup-2026` |
| B1 | Owner's iPhone test (10-17) | Choice buttons could not be seen before the dine option | Real phone, quiet | ISSUE I-395 to I-400 |
| B2 | Open microphone with bystander speech (11-22) | 0 of 12 orders right at -20 dB or louder; a bystander's "yes" taken in 10 of 15 | Synthetic voices, digital mix | `spikes/crowd-voice/README.md` |
| A2 | Hold to talk (11-22) | One sentence right in 17 of 18 up to 0 dB; five holds reached `paying` 18 of 18 in quiet, 6 of 7 at -10 dB, 1 of 3 at 0 dB | Same | same |
| B3 | Owner's iPhone test of hold to talk (11-22) | "The first press sometimes does not take my voice; the first connection is slow" | Real phone, candidate `kibo-00040-yig` | ISSUE I-439 |
| B4 | Mentor session questions (11-20): tap on the mic to KIBO's first hello on production | 3.5 to 6.0 s, median 3.8 s (5 runs); token 0.9 s, Live setup 2.1 s, hello 0.6 s after | Headless Chrome, fake mic, not a phone. The mentor's answers were not written down | `mentoring/tap-to-hello-20261120.json` (folder not in git) |
| — | Finale format | "A live demo in front of Google Cloud leaders and industry experts"; minutes per team, and whether all 50 present, not stated | Read 11-22 | aibuildercup.com (home, rewards, FAQ) |

Missing: a real phone in a real loud room (none yet); real users other than the owner (none recorded); the finale's
time per team and scoring sheet (ask the organizer or a mentor).

## 3. Key variable

- Candidates: (a) the live demo works on the first try on a real phone in a loud hall; (b) evidence from real users
  (Impact, 25%); (c) one more technical "wow" (Technical Merit, 40%).
- **Chosen: (a).** Both real phone tests found a blocker the browser tests had passed (B1, B3), the finale is a live
  demo, and a hall is loud (B2). This task → fewer ways for a spoken order to be lost → more first-try orders.
- **Drop it if:** the organizer says the finale is judged from slides or video without a live demo, or the owner's
  loud-room test reaches the target twice in a row; then (b) is next.

## 4. Choosing work

- Before a task: one line, "does this move the main number, and how?" If not, it waits.
- After a task: what the judge showed (the owner's phone, a measured run), not "done".
- Not now: new screens or kiosks; refactors. One exception, reopened by the owner 11-26: a Japanese-subway-style
  ticket machine as a demo example (branch `feat/jp-metro-kiosk`, not deployed). It does not move the main number; it
  serves the story (a visitor, a foreign screen, fares by destination, one sentence).
- Reopened 11-25 by the owner: "solve the cocktail party without pressing: tell apart the voice of the person I was
  talking with, recognise it (embeddings are fine); if that fails, hold to talk." A speaker model that is not Gemini
  may be tried in `spikes/`, but shipping one in `src/` needs the owner's explicit word (CLAUDE.md: Gemini for every
  AI feature; license, size, iOS Safari and the Google AI score).

## 5. Experiment now

### Speaker-aware listening: no pressing, and the customer's words only (planned; ADR-014)

The owner, 11-25: "this will be our technical moat; we must have it", then "plan how to remove the part where two
people talk at once". Building waits for the owner's word; the dates are proposals. Kept meanwhile: hold to talk on
candidate `kibo-00044-hid`, production `kibo-00041-gow`. The order review needs a tap or a hold in every mode.

- **Two problems, two tools.** (1) Turns: bystanders talking between the customer's sentences keep Live's turn open
  and put their words in (open mic: 0 of 12 right at -20 dB). A *gate* that sends only the customer's stretches
  fixes this; its ceiling is hold to talk. (2) Overlap: a bystander talking at the same moment as the customer. Only
  *extraction* fixes this: something that takes the customer's words out of the mixture (hold to talk at 0 dB:
  `paying` 2 of 6).
- **Stage 0, done 11-25: Gemini Embedding 2 cannot tell voices apart** (nearest clip the same words 48 of 48, the same
  voice 0 of 48; `spikes/speaker-gate/README.md`). So the gate needs a speaker-verification model, or Gemini must do
  the attribution itself.
- **Stage 1, 11-26: the judge first.** Crowd benchmark v2 in `spikes/speaker-gate/`: real recorded voices with a
  license that allows it (public read speech, English and Korean) as well as TTS; customer alone, bystander alone,
  and overlap at +5, 0 and -5 dB; enrolment from the customer's first 3 s. Measures: customer words kept, bystander
  words leaked (one fixed transcriber), added delay, and the order on real Gemini Live (`run.ts`, 20 runs per cell).
  Added 11-26 by the owner ("many other voices, or music playing"): several bystanders at once (babble) and music
  under the customer are conditions of the judge too. The owner's order of work (memo, 11-26): enrol the voice from a
  short sample, filter by voice before transcribing, then drop words that do not belong to the order.
- **Stage 2, 11-26 to 11-27: three candidates on that judge.**
  - A, Gemini only: Gemini Flash hears the customer's sample and the mixture and writes only the customer's words;
    Live gets them as text and answers by voice. Keeps "Gemini for every AI feature"; costs a call per turn.
  - B, gate: a small speaker-verification model (e.g. CAM++ or ECAPA, open licence) drives the hold machinery.
  - C, extraction: a target-speaker extraction model conditioned on the customer's voice cleans the audio before Live
    (published family: VoiceFilter, SpeakerBeam, SpEx; open toolkits exist). Heaviest; the only one that can beat
    hold at 0 dB on the audio itself.
- **Adopt** (for the finale): at 0 dB overlap the order right in 18 or more of 20 and bystander items added in 1 or
  fewer; the customer alone no worse than today; added delay 0.5 s or less for B and C, 1.5 s or less for A.
  "As good as hold without the press" (B alone) is the fallback goal if no candidate removes overlap.
- **Stage 3, 11-28 to 12-01, only on the owner's word:** the winner into the app behind `VOICE_INPUT=open` (on the
  phone, or in the `kibo-voice` relay, which already sits in the audio path), rehearsal with a recorded bystander
  playing next to the phone, and the owner's phone test in a loud place with a teammate talking over them. A model
  that is not Gemini needs the owner's explicit word first.
- **Stop:** no candidate meets the adopt line by 11-28, or the phone test fails by 12-01: hold to talk on stage, and
  the benchmark numbers go in the deck as the next step (never as a finished feature).

### Plan of 11-26 (the owner: "aim for first place; solve everything I said"; made with goal-lens and be-ambitious)

The owner's list, 11-26: the cocktail party (several voices, music, singing) with experiments; meaning before
embeddings ("an embedding is hard: test whether filtering by meaning is good enough; throw away what is too low in
decibels; design the experiment so it hears well"); music and singing through an existing library; both mentoring
problems (listening in a loud place; the first connection, B4); a Japanese-subway-style ticket machine; the Top 50
blog by Sat 11-28 15:30 KST, written from the current technology plus this experiment.

- **Rung chosen (2 of 3): remove the cause, and show it.** Not three rival models but one stack of cheap layers, each
  scored alone and combined on the frozen judge (`spikes/speaker-gate/bench/`): L0 library noise and music removal;
  L1 loudness (drop what is too quiet next to the customer); L2 voice gate (optional); L3 meaning (Gemini keeps only
  words addressed to the ordering assistant that fit the conversation); the order review always needs a tap or a
  hold. Bystanders are split by what they say (small talk, a rival order from the same menu, a "yes" on the review,
  song lyrics), because meaning can only filter some of it (expected, not measured). Rung 3, a stretch: the judge
  becomes a command every voice change must pass, and the blog publishes it.
- **Main line since 11-26 23:40 (the owner): the meaning layer.** L3 is built as a flow filter, not a one-line rule:
  inside Live (`l3-flow-live`: act only on what continues this customer's order or answers the question just asked)
  and as transcribe-then-filter (`l3-flow-text`: a fast Gemini text call returns only the words that continue the
  customer's flow, with "complete" and "unsure" flags). Something must also end the turn without a press (the open
  microphone's first failure is that Live never hears silence): L1's gate closing, or the "complete" flag. A
  multi-turn "flow session" is added to the judge, with bystanders who chat and bystanders who talk about the same
  menu. First read from the judge, before these exist (`spikes/speaker-gate/bench/logs/words-*.json`, 12 trials a
  cell, English): the library layer L0 (GTCRN) bought nothing on music (customer words kept 97% to 98%) or on the
  song stand-in (73% to 72%) and cost customer words under a talker (95% to 78%).
- **Hard targets (proposed):** the adopt line above at 0 dB; at -10 dB (a phone near the mouth) 20 of 20 without a
  press; the customer's quiet "yes" still heard; tap on the mic to hello 2 s or less measured, and something heard
  within 0.5 s of the tap.
- **Judges:** the frozen bench, then the owner's phone with a loudspeaker playing babble and music at a measured
  level, then a second person talking over them. A digital mix alone never decides.
- **The field test is built for the owner and a teammate to run themselves** (owner 11-26: "let us test it in a loud
  place too"): one candidate image on top of `feat/fast-hello`, so both mentoring problems ride together, deployed
  as two tagged revisions at 0% of traffic (`VOICE_INPUT=open` with `CONFIRM_TAP_ONLY=1`, and `hold`), production
  as the third arm; protocol in `docs/TESTING.md` "Field test in a loud place". The open arm ships only what was
  scored and only Gemini plus our own code: the loudness gate with a plain level detector ends the turn, the flow
  instruction filters by meaning. A model that is not Gemini still needs the owner's explicit word.
- **Money (owner 11-26: "there is no budget; watch it"):** no experiment Live session without a number from the
  owner; text-only scoring first; one ledger and hard stops (`docs/plan/OPERATIONS.md` "Spend watch"). The phone
  test is the cheaper judge and the one that decides, so Live money goes to the multi-turn flow cells and to 20 runs
  for one winner, not to a grid.
- **Blog (the deliverable, Sat 11-28 15:30 KST):** `docs/plan/BLOG.md` is publishable from numbers already in hand
  (baselines, the library layer) and gains the flow results as they land; results cut-off Fri 11-27 22:00 KST. Before
  it goes to the owner: an agent that built nothing re-derives every number from the logs, and
  `grep -n "\[\[RESULT\|\[\[OPTIONAL" docs/plan/BLOG.md` returns nothing.
- **Order (by the main number and the dates):** (1) blog draft with slots, filled Fri 11-27; (2) layers on the judge,
  the best stack to a phone test by 11-29; (3) the first hello (branch from `feat/hold-to-talk`: measure on the
  candidate first, then connect before the tap, a smaller setup, a greeting that plays at once); (4) the subway
  machine on its own branch, merged only after QA by a session that did not build it.
- **Against (kept in view):** every layer adds delay and a way to shut the customer out; a phone near the mouth may
  already put bystanders 10 dB down, where loudness and a hold are enough. The subway machine and yen touch price
  paths and do not move the main number: off the hero path, and dropped if not clean by 12-01.
- **Not known:** what the mentor answered on 11-20 (ask the owner); the finale's time per team; a real phone in a
  real loud room (none yet).

- Change: the first press (I-439) and the voice start's 2 s key probe, on the candidate only.
- Kept: production (`kibo-00041-gow`), the submitted flow.
- Baseline: B3 (first press lost; reproduced in a browser at two of four press moments).
- Adopt if: the owner's phone test loses no first press in 10 tries. Stop if: a hold shows "Listening…" and the words
  still do not arrive.
- Tried 11-22 (the owner's idea, "recognise only my voice"): telling Gemini Live whose voice is the customer's, with or
  without a spoken sample. At 0 dB the order reached `paying` in 2, 1 and 1 of 6: no gain, not shipped
  (`spikes/crowd-voice/README.md`). What keeps other voices out today is distance: the phone near the mouth.
- Rehearsal before every candidate is handed over: `npm run rehearse -- --url <address>` (four press moments, Korean
  and English). It is the first judge; the owner's phone is the second and decides.

## 6. Log

| Date | Main number | With it | What changed |
|---|---|---|---|
| 11-22 | not measured (no loud-room phone test yet) | voice start request median 2.05 s (52 calls) | Goal written; key variable (a) chosen |
| 11-23 | not measured on a phone; rehearsal on the deployed candidate 22 of 22 first-try orders (synthetic voice, Chromium, quiet) | tap to a hold that counts: median 332 to 350 ms; voice start request median 562 ms in runs 30 to 40 s apart (was 2,382 ms, spaced differently), 1,144 ms after 4 idle minutes; release to both lines on the kiosk median 731 ms (moments) and 1,167 ms (hold while connecting) | Candidate `kibo-00044-hid`: I-439, I-440, I-441, I-206. "Only my voice" instruction or sample: no gain at 0 dB, not shipped |
