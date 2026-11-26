# l1-loud: the loudness gate (layer L1)

`gate.ts` is pure TypeScript with no Node or browser API, so the app can lift it as it is. Tests:
`npx vitest run --root spikes/speaker-gate/candidates/l1-loud` (20 tests, including the first gate's three lock-out
cases from `spikes/crowd-voice/README.md`, on both the 32 ms Silero path and the 40 ms level-only path).

Its job, after the 11-27 results (kibo-59): not to filter chat (the meaning layer does that better), but to **end the
customer's turn without a press** and **never lose the customer**. It cannot separate a bystander as loud as the
customer.

## The contract for the app

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
- **`g.asked()`:** call it when KIBO finishes speaking (Live's `turnComplete` after audio). For 4 s the bar is 6 dB
  lower, so a quiet "yes" gets through.
- **Half-duplex stays as it is:** the app sends nothing while KIBO's voice plays and 300 ms after. The gate may keep
  receiving frames meanwhile.
- **Warm start (optional):** `g.learn(dbfs)` per frame of an enrolment before the live audio; it sets the level only
  until the first run of speech in the live audio. The phone has no enrolment today, so the app runs cold.
- **A hold always works:** the press-to-talk path stays as the way back.

## Fixed values (`DEFAULTS`)

| Value | Setting | Why |
|---|---|---|
| `depthDb` | 6 dB under the level | dev-slice sweep, rule written first (`SWEEP.md`): 6 scored 0.522, 9/12/15 scored 0.499 to 0.502 |
| level | the loudest run of speech in the last 5 s (`anchorMs`) | a quieter voice under a louder one never pulls the bar down; a lone talker is never gated out |
| learning | runs of at least 0.6 s (`commitMs`), each 0.6 s chunk the lower of itself and the chunk before | a 0.2 to 0.5 s bang cannot raise the level |
| floor | falls at once, rises 1 dB/s | WebRTC AGC2's noise floor rule |
| speech test | 10 dB over the floor (`vadOverFloorDb`); bar never under floor + 6 dB | no model |
| opening | 2 near frames of the last 3, 0.2 s pre-roll | |
| hang-over | 0.7 s after the last near frame | |
| question lowering | 6 dB for 4 s after `asked()` | |
| turn cap | 10 s (`maxTurnMs`) | above |

## The trade made on 11-27

The first warm version learned the level from the enrolment and only raised it: chat@-10 leaked 15% (en) and 7% (ko)
against hold-oracle's 14% and 9%, but a customer 12 dB quieter than their enrolment kept 3% (en) and 0% (ko) of their
words (`bench/logs/words-l1-loud-warm-2026-11-26T14-54-34-160Z.json`). The current rule keeps them (97%, 98%) and the
customer alone (95%, 100%), and gives the -10 dB win back in English (leaked 51%; ko 18%)
(`words-l1-loud-warm-2026-11-26T15-15-21-100Z.json`), because bystanders who talk before the customer's first word
now set the level. Level alone cannot tell a quieter customer from a quieter bystander who talks first. The
orchestrator accepted this trade: the meaning layer removes that leading chat.

## Files

- `gate.ts`, `gate.test.ts`: the gate and its tests.
- `run.ts`: the bench runner through the judge's file contract (segments only, no out.wav). `--vad energy` (default)
  or `--vad silero`, `--warm`, `--depth`, `--input-from <upstream>` for chains.
- `vad.py`: Silero VAD flags per 32 ms window for the comparison variant (kibo-fd's venv and model, read only); output
  in `work/` (git-ignored).
- `dev-slice.txt`, `SWEEP.md`: the depth sweep's trials and its rule, written before any result.
