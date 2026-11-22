# KIBO goal

Updated: 2026-11-23 · Next check: 2026-11-25 (after the owner's next phone test), then 2026-12-01 (freeze)

- **Readers:** every session and agent working on KIBO (before choosing work, and after finishing it), and the owner.
- **Purpose:** every task is chosen and judged against the same goal and number. The method is the `goal-lens` skill.

## 1. Goal

- **One sentence:** On 2026-12-04 in Singapore the judging panel watches KIBO's live demo work on the first try in a
  loud hall and ranks it first.
- **Why (asked twice):** The owner (11-22): "improve it so that this app is worth 10 million won or more and wins the
  AI Builder Cup." Why win: the contest is the launch point for a business (memory `kibo-business-goal`, 10-15). What
  that needs: an app that does its job for a stranger in a real, noisy place, not only in a recorded video.
- **Main number:** first-try orders on a real phone in a loud place: of 10 hero orders (pair by QR, speak, confirm,
  pay on the kiosk) by a person, how many finish with the right cart and no retry. Target 9 of 10 (proposed, not the
  owner's number). Judge: the owner's own phone test, not this session's browser.
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
- Not now: an on-device speaker model that is not Gemini (license, size, iOS Safari, and the Google AI score);
  new screens or kiosks; refactors. Look again if hold to talk fails the loud-room test.

## 5. Experiment now

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
| 11-23 | not measured on a phone; rehearsal on the deployed candidate 22 of 22 first-try orders (synthetic voice, Chromium, quiet) | tap to a hold that counts: median 332 to 350 ms; voice start request median 562 ms (was 2,382 ms); release to both lines on the kiosk median 731 ms (moments) and 1,167 ms (hold while connecting) | Candidate `kibo-00044-hid`: I-439, I-440, I-441, I-206. "Only my voice" instruction or sample: no gain at 0 dB, not shipped |
