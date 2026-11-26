# l1-loud: the loudness gate (layer L1)

`gate.ts` is pure TypeScript with no Node or browser API, so the app can lift it as it is. Tests:
`npx vitest run --root spikes/speaker-gate/candidates/l1-loud` (20 tests, including the first gate's three lock-out
cases from `spikes/crowd-voice/README.md`, on both the 32 ms Silero path and the 40 ms level-only path).

Its job, after the 11-27 results (kibo-59): not to filter chat (the meaning layer does that better), but to **end the
customer's turn without a press** and **never lose the customer**. It cannot separate a bystander as loud as the
customer.

## The pick (11-27): `loudGate(PICK)`

From the offline screen (`screen.ts`, no API cost; 64 flow mixes and 72 single-sentence trials replayed at 40 ms with
KIBO's replies simulated; results in `work/screen.json`): **the customer's level from the first turn** (`anchor:
"first-turn"`), **depth 6 dB**, **no lowering after a question** (`askDb: 0`), **hang-over 1.0 s**, **cap 10 s**,
learning only from accepted speech within 3 dB of the level. On the flow cells at -10 dB, en | ko:

| | bystander-only time open | activity ends per session | customer time open | closes inside a sentence (of 16 sessions) |
|---|---|---|---|---|
| the 11-26 rule (recent anchor, lone talker kept) | chat 78 / 68%, menu 76 / 67% | 13.1 / 12.8, 15.0 / 11.5 | 99 to 100% | 5 / 1, 8 / 1 |
| the pick | chat 22 / 23%, menu 16 / 18% | 8.1 / 6.8, 5.6 / 5.4 | 98 to 99% | 0 / 0, 0 / 0 |

At 0 dB no variant does anything (bystander-only time open 95 to 99%). The lowering after a question opened the gate
on a lone -10 dB neighbour 86 to 89% of the time inside its 4 s window, so it is off; a customer more than 7 dB under
their first turn does not open the gate and needs hold to talk (synthetic sweep). An enrolment anchor would keep the
neighbour out a little better (7 to 14%) but cut sentences (6 to 10 of 16) and lose the quiet customer (quiet-12 kept
2%); the first-turn anchor needs no recording. The neighbour talked first in 64 of 64 flow mixes, yet set the anchor
in 1 of 64, because the first open turn ran on into the customer's sentence and the anchor is that turn's loudest
0.6 s; a neighbour whose first turn ends before the customer speaks would set it (not in these mixes; a real risk).

## The contract for the app

- **Create:** `const g = loudGate(PICK)`, once per conversation (after the tap that starts listening).
- **Frames:** 40 ms at 16 kHz (640 samples, -1..1), the app's existing microphone frames. Call
  `g.pushFrame(frame)` once per frame; it returns `true` while the gate is open. No voice detector is needed: the gate's
  own speech test (a frame 10 dB over the tracked room floor) is the main variant. A detector's flag can be passed as
  the second argument (`pushFrame(frame, isSpeech)`), but Silero VAD is a model that is not Gemini and needs the
  owner's word before `src/`.
- **Hold back:** keep the last 1 s of frames (heldBack keeps 0.2 s today). When the gate opens, it can reach back to
  where the run of speech began (up to about 0.8 s: the 0.6 s needed to learn a new level plus the 0.2 s pre-roll).
- **On open** (`false` then `true`): read `g.segments()`; the last segment's start (ms since the first frame) says
  where the turn began. Send the activity start (or nothing, with automatic activity detection), then the held
  frames from that start, at once, then live frames.
- **On close** (`true` then `false`): send the activity end (`audioStreamEnd` today; `activityEnd` with automatic
  activity detection disabled). Send nothing while closed.
- **The turn cap:** a turn open for 10 s closes on its own (the same `true` then `false`); the next frame of speech
  opens a new turn from that point. Treat it exactly as a close and an open. 10 s is longer than any customer
  sentence on the bench (8.9 s) plus the gate's 0.9 s of pre-roll and hang-over.
- **`g.asked()`:** with `PICK` it does nothing (`askDb: 0`). If the lowering is ever turned back on, call it when
  KIBO's playback ends, not at Live's `turnComplete` (that comes when generation ends, before playback does). The
  lowering was not exercised on Live: on the bench's 12 s timeline no customer answer fell inside its 4 s window.
- **Half-duplex stays as it is:** the app sends nothing while KIBO's voice plays and 300 ms after. The gate may keep
  receiving frames meanwhile.
- **No enrolment needed:** with `PICK` the first turn sets the level. (`learn()` and `anchor: "enrol"` exist for the
  bench only.)
- **The review is tap only:** with an open microphone the server's "fresh utterance" can be a bystander's (four
  payments confirmed on bystander speech in 48 no-press Live sessions, 11-27); ship with `CONFIRM_TAP_ONLY=1`.
- **A hold always works:** the press-to-talk path stays as the way back.

## Fixed values (`DEFAULTS`)

| Value | Setting | Why |
|---|---|---|
| `depthDb` | 6 dB under the level | dev-slice sweep, rule written first (`SWEEP.md`): 6 scored 0.522, 9/12/15 scored 0.499 to 0.502 |
| level | default: the loudest run of speech in the last 5 s (`anchorMs`), a lone talker never gated out; `PICK`: the first turn's loudest 0.6 s, then accepted speech within 3 dB, 0.5 dB per 0.6 s | the default fed a lone neighbour's sentences to Live as turns (12.8 activity ends a session against hold-oracle's 4) |
| learning | runs of at least 0.6 s (`commitMs`), each 0.6 s chunk the lower of itself and the chunk before | a 0.2 to 0.5 s bang cannot raise the level |
| floor | falls at once, rises 1 dB/s | WebRTC AGC2's noise floor rule |
| speech test | 10 dB over the floor (`vadOverFloorDb`); bar never under floor + 6 dB | no model |
| opening | 2 near frames of the last 3, 0.2 s pre-roll | |
| hang-over | 0.7 s after the last near frame (`PICK`: 1.0 s) | 0.7 s cut English sentences 7 to 8 times in 16 sessions; 1.0 s none |
| question lowering | 6 dB for 4 s after `asked()` (`PICK`: off) | it opened the gate on a lone neighbour |
| turn cap | 10 s (`maxTurnMs`) | above |

## The trade made on 11-27

The first warm version learned the level from the enrolment and only raised it: chat@-10 leaked 15% (en) and 7% (ko)
against hold-oracle's 14% and 9%, but a customer 12 dB quieter than their enrolment kept 3% (en) and 0% (ko) of their
words (`bench/logs/words-l1-loud-warm-2026-11-26T14-54-34-160Z.json`). The current rule keeps them (97%, 98%) and the
customer alone (95%, 100%), and gives the -10 dB win back in English (leaked 51%; ko 18%)
(`words-l1-loud-warm-2026-11-26T15-15-21-100Z.json`), because bystanders who talk before the customer's first word
now set the level. Level alone cannot tell a quieter customer from a quieter bystander who talks first. The
orchestrator accepted this trade: the meaning layer removes that leading chat.

## Settings added after the 20-run read (11-27)

All three are off in `DEFAULTS` and in `PICK`; `screen.ts --variants` compares them, and `bysOnlySeg` / `custSeg`
measure what Live would get (the segments), not the frames the gate called open.

- `reachBack: "near"`: once anchored, a turn starts at its first frame over the bar minus the pre-roll, not at the start
  of the run of speech under way (that pulled 1.5 to 3.4 s of a neighbour in front of the customer: f0003, f0008, f0012).
- `trimFirstTurn: true`: the first turn, when it sets the anchor, starts at its first frame within `depthDb` of that
  anchor, dropping a quieter lead-in (f0020, f0024, f0062). The phone must hold that turn until it closes (at most the
  10 s cap plus pre-roll: about 326 KB at 16 kHz, 16-bit) and send it in a burst, so Live starts on it about 1 s after
  the last word instead of while the person speaks; `bench/flow.ts` does the same when the setting is on.
- `anchorRise: true` (I-471): a run more than `learnWithinDb` over the anchor, accepted in a turn, lifts the anchor to
  its level when the turn closes, unless the cap ended the turn or it began straight out of a capped one. Without it,
  whoever talked first in a turn of their own kept the anchor (Live on the field build: a neighbour 10 dB under the
  customer, talking from the start, passed every later turn). Tested: neighbour -36, customer -26, neighbour again ->
  anchor -26 and the neighbour's later sentence stays out. **The cost**, also tested: customer -26, one loud passer-by
  sentence at -18, customer -26 again -> the anchor is -18 and the customer is kept out; after about 3 s of their
  speech under the bar the app shows the hint to hold the button, and a press re-anchors to them.

Offline at depth 6 (both languages, n 16 per flow cell), neighbour-only time inside the segments: chat@-10 40% (pick),
39% (+rise), 23% (+near+trim), 23% (all three); menu@-10 25, 24, 16, 15%. The customer's speech inside the segments
stays 100% in the flow cells and 98 to 100% in the words cells (alone, short, quiet-6, quiet-12), no trial needing the
fallback. The bench rarely anchors on a neighbour at depth 6 (0 of 64 flow mixes; at depth 5 1 of 64, at depth 4 2 of
64, kibo-fd), so `anchorRise` barely moves these numbers; it is for a neighbour who pauses longer than the hang-over.

## Files

- `gate.ts`, `gate.test.ts`: the gate and its tests.
- `run.ts`: the bench runner through the judge's file contract (segments only, no out.wav). `--vad energy` (default)
  or `--vad silero`, `--warm`, `--depth`, `--input-from <upstream>` for chains.
- `vad.py`: Silero VAD flags per 32 ms window for the comparison variant (kibo-fd's venv and model, read only); output
  in `work/` (git-ignored).
- `dev-slice.txt`, `SWEEP.md`: the depth sweep's trials and its rule, written before any result.
- `screen.ts`: the offline screen of gate variants against the flow and single-sentence timelines.
