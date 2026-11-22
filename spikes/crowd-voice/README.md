# Crowd test: other people talking near the phone

Owner, 2026-11-22, before the Singapore finale: what happens when several voices reach the phone at once (the
"cocktail party" problem), and can an algorithm control it?

**Answer:** with the shipped settings, any nearby talk breaks a voice order. Hold-to-talk (the phone sends the
microphone only while a button is held) keeps the order right with bystanders up to as loud as the user, at about
the same response time, and fails when they are louder. A loudness gate (`nearGate.ts`) helps only while bystanders
are at least 15 dB quieter than a user it has heard for a whole sentence, and it can shut the user out; it is not
used by the app. All of this is measured on a digital mix of synthetic voices; nothing here was measured on a real
phone in a real room, and nothing in the app has changed.

## Method

- `synth.ts`: Gemini TTS bystander clips in four voices (small talk and a rival order from the same menu, English and
  Korean; a "yes" for the review). The user is the e2e fixture voice (`e2e/fixtures/hero-en.wav`, `hero-ko.wav`).
- `run.ts`: mixes them at 16 kHz and sends the mix to Gemini Live (`gemini-3.8-live`, the phone's own pinned config
  from `liveConnectConfig`) the way the phone does: 40 ms frames in real time, nothing while the AI's reply plays,
  tool calls through the real command path on a memory store.
- **Order:** 5 s of bystanders alone, the user's hero order over them, 12 s of bystanders alone. The user's speech is
  at -20 dBFS; "level" is the bystanders' speech level relative to it. A run is **right** when the AI did nothing
  before or while the user spoke, reacted within 5 s of the user's last word, and the cart at the end holds the two
  cheeseburger sets and nothing else.
- **Review:** the order is in and the confirm card is open; the user says nothing and a bystander says "Yes. Yes,
  that's right." Counted: runs where the AI's `confirmCheckout` was accepted (the order moved to `paying`; the card
  still has to be inserted at the kiosk before anything is paid).
- **Gate, cold:** the gate has heard nobody yet. This is the demo's own case when the order is the first thing said
  (the dine option tapped). **Gate, warm:** it has already heard the user: their whole order sentence (5 to 6 s) was
  fed to the gate, not to Live. Whether a one-second answer to the greeting is enough to learn the level is not
  measured.

## Results (2026-11-22, 3 runs per cell, one session)

Order, English, right of 3:

| Bystanders vs user | Shipped | Gate, cold | Gate, warm |
|---|---|---|---|
| none | 3 | (not run) | (not run) |
| -25 dB | 1 | 3 | 3 |
| -20 dB | 0 | 2 | 3 |
| -15 dB | 0 | 0 | 3 |
| -10 dB | 0 | 0 | 1 |
| -5 dB | 0 | 0 | 0 |

Order, Korean, right of 3: shipped none 3, -20 dB 0, -15 dB 0, -10 dB 0; gate warm none 3, -20 dB 3, -15 dB 3,
-10 dB 0.

Review, English, a bystander's yes accepted, of 3:

| Bystander vs user | Shipped | Gate (warm) |
|---|---|---|
| -20 dB | 1 | 0 |
| -15 dB | 2 | 0 |
| -10 dB | 3 | 0 |
| -5 dB | 2 | 2 |
| 0 dB | 2 | 1 |

How the shipped settings fail (logs): the turn never ends because Live never hears 1 s of silence (no transcript and
no reaction for the whole 12 s tail); the transcript mixes the bystanders' words into the user's; the AI adds the
bystander's order (spicy chicken burger, cola, bulgogi burger) to the cart.

**Hold-to-talk** (`--ptt`: the phone sends the microphone only from 0.2 s before to 0.2 s after the user's own
speech and silence otherwise, as a held button would; no gate, shipped Live settings). Order, right of 3:

| Bystanders vs user | English | Korean |
|---|---|---|
| -15 dB | 3 | 3 |
| -10 dB | 3 | 3 |
| -5 dB | 2 | 3 |
| 0 dB (as loud as the user) | 2 | 3 |

The two misses mixed a bystander's words into the order while the button was held.

With `audioStreamEnd` sent on release and nothing after it (`--ptt-end`), right of 3: English none 3, -10 dB 3,
0 dB 2; Korean none 3, -10 dB 3, 0 dB 3. Bystanders **louder** than the user: English +5 dB 0, +10 dB 0; Korean
+5 dB 2, +10 dB 1. So hold-to-talk holds up to bystanders as loud as the user and not beyond.

End of the user's speech to the AI's first reaction (audio or tool call), median of the right runs: shipped settings
with no bystanders 1,158 ms (7 runs, 1,124 to 1,240); hold-to-talk 1,399 ms (22 runs, 1,200 to 2,389); hold-to-talk
with `audioStreamEnd` 1,288 ms (the 17 right runs at none, -10 dB and 0 dB; 1,019 to 1,506); gate,
warm 2,118 ms (19 runs, 1,181 to 3,326). The release is fixed at 0.2 s after the last word; a person's timing is
not in these numbers. A bystander's yes cannot reach
Live while the button is up (by construction, not measured).

**Several holds in one session** (`multi.ts`, English: the hero order as five holds, order, large fries, no dessert,
"That's all. I'll pay.", "Yes."; bystanders talk the whole time and reach Live only during a hold; `audioStreamEnd`
on each release). The question was whether a later hold is still heard after an earlier `audioStreamEnd`. Every hold
was answered: 110 of 110 on the Gemini API (22 sessions), 30 of 30 on Vertex AI as the relay uses it (6 sessions),
and 30 of 30 with 1.2 s of silence instead of the end signal (6 sessions). That includes 5 sessions (3 Gemini API,
2 Vertex AI) with 90 s of nothing sent before the third hold (`--gap-ms 90000`), as while a user reads the menu: the
connection stayed open and the hold after the gap was answered in all 5. Release to the AI's first reaction on the
Gemini API: median 828 ms (387 to 3,282, 110 holds); the control below, an open microphone in quiet, 1,170 ms
(1,035 to 3,516, 30 turns), both counted from 0.2 s after the last word.

| Bystanders vs user | Sessions | Reached `paying` | Other people's words in the transcript |
|---|---|---|---|
| none, Gemini API | 14 | 14 | 0 |
| none, Vertex AI | 4 | 4 | 0 |
| none, open microphone (control, `--release open`) | 6 | 6 | 0 |
| -10 dB, Gemini API | 5 | 4 | 1 |
| -10 dB, Vertex AI | 2 | 2 | 0 |
| 0 dB, Gemini API | 3 | 1 | 3 |

With bystanders, a short hold ("That's all. I'll pay.", 1.8 s) was heard as the bystander's words ("레모네이드", "It
is cheaper anyway."), and at 0 dB once the first hold was heard as the bystander's order. So holding limits
bystanders to the moments the button is down; inside a hold a bystander near the user's level can still win, most
easily over a short phrase. Without bystanders every session ordered two cheeseburger sets with large fries, zero
cola and cider; which of the two burgers lost its pickles ("one without pickles" does not say) matched the hero cart
in 3 of 6 sessions with holds and 3 of 6 with the open microphone (the 12 sessions whose final cart was logged), so
that difference is the sentence, not the hold. The summary's "hero cart" line counts it and reads too low.

**In the app (11-22).** Hold to talk is built on the phone (`src/lib/voice/hold.ts`, `useLiveVoice`,
`docs/ARCHITECTURE.md` "Voice"). `e2e/voice.live.spec.ts`, where the browser holds the mic while a synthetic voice
speaks and lets go 0.7 s after its last word: direct hero-en 4 of 4 and hero-ko 4 of 4, relay hero-en 4 of 4, relay
hero-ko 5 of 7 (both misses filled the hero cart and answered Korean speech in English on `/demo`'s English screens,
the open issue I-272 from 10-15, where the relay's model ignored the reply-language instruction; its rate with the
open microphone was never measured); `e2e/two-device.spec.ts` spoken Korean order 5 of 5, and in 3 of 3 of those the
greeting ended with "Hold the mic button while you talk." word for word. In 8 of these runs (the two full passes before the last), the last word to the kiosk highlight was a
median 1,590 ms direct (4 runs, 1,381 to 2,883) and 1,542 ms through the relay (4 runs, 1,394 to 1,959), the 0.7 s
before the release included; with the open microphone the direct median was 2,118 ms (`docs/plan/NUMBERS.md`). Not
added to `evidence/`. Not run on a real phone or in a real room, and a person's release time will differ.

**What the gate costs the user.** The user's own "Yes." on the review, said more quietly than their order, confirmed
(of 3): without the gate 2, 3, 2, 3 at 0, -6, -9, -12 dB; with the gate 3, 3, 2, 0. So a yes 12 dB quieter than the
order is not heard at all with the gate. A gate that heard only the first second of the user (`--warm-ms 1000`)
did not help the order: right 1, 0, 0 of 3 at -20, -15, -10 dB; a bystander's first syllables got through ("Can I",
"What") and the AI answered them before the user spoke. `levels.ts` (offline): in the fixture sentences 31 of 108
(English) and 31 of 122 (Korean) voiced 40 ms frames are more than 9 dB under the level the gate learns, so the
hang-over, not the bar, carries a quarter of the user's own speech.

Live settings alone did not help (order, English, right of 3): `startOfSpeechSensitivity` low: -20 dB 0, -10 dB 0;
`proactivity.proactiveAudio` set: -20 dB 0, -10 dB 0 (Google's documentation says it is always on for this model).

Also on record: a first smoke run of the shipped settings (none 1 of 1, -10 dB 0 of 1), and an earlier gate without
its starting level (order cold: none 3, -25 dB 2, -20 dB 1, -15 dB 1, -10 dB 1, -5 dB 0; review: 0, 0, 0, 2, 2 of 3).
Every run is in `logs/` (synthetic transcripts and tool calls only).

The browser path with the gate wired into `useLiveVoice` (since removed): `e2e/voice.live.spec.ts` direct, hero-en and hero-ko, 1 run each, both passed
(2026-11-22; end of speech to kiosk highlight 1,725 ms and 1,477 ms; not added to `evidence/`).

## Limits

- A digital mix: no room, no phone microphone, no browser echo cancellation, noise suppression or automatic gain.
  Automatic gain may lift quiet bystanders while the user is silent, and the gate's starting level (0.04 RMS) is an
  assumption about how loud a close voice arrives. Both need a real phone in a loud room.
- Loudness cannot separate a bystander who is as loud at the microphone as the user (a shoulder-to-shoulder queue, a
  loudspeaker). Hold-to-talk (measured above as a mix, not built in the app) or tap-only confirmation
  (`CONFIRM_TAP_ONLY=1`, not tested here) are the options there.
- Before the user's first words the gate only has its starting level, so the first sentence is the weakest moment.
- The gate can shut the user out until the microphone is turned off and on (independent review, 11-22, simulated on
  `nearGate.ts`): frames under the bar are never learned and nothing decays, so a user who speaks 12 dB more quietly
  than their first sentence is not heard (15 dB: never again), and a sound about 3 times louder than the user for
  200 to 500 ms raises the bar over the user's voice. The same review: a bystander within 9 dB pulls the bar down, so
  after 3 s of one 8 dB below the user, one 15 dB below passes; a microphone whose speech arrives under about 0.014
  RMS is cut from the start; the gate's held frames go stale across a half-duplex mute.
- The loudness cut-in (`bargeIn.ts`) was removed with hold to talk (11-22); a press on the mic cuts in instead.
- 3 runs per cell, synthetic voices, one day.

## Run

```
npx tsx --env-file=.env spikes/crowd-voice/synth.ts
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario order --lang en --levels off,-25,-20,-15,-10,-5 --runs 3
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario order --lang en --levels -25,-20,-15,-10,-5 --runs 3 --gate --warm
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario review --lang en --levels -20,-15,-10,-5,0 --runs 3 --gate
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario ownyes --lang en --levels 0,-6,-9,-12 --runs 3 --gate
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario order --lang en --levels -15,-10,-5,0 --runs 3 --ptt
npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario order --lang en --levels off,-10,0,5,10 --runs 3 --ptt-end
npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release end --levels off,-10,0 --runs 3
npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release end --levels off,-10 --runs 2 --vertex
npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release end --levels off --runs 3 --gap-ms 90000
npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release open --levels off --runs 6
npx tsx spikes/crowd-voice/levels.ts
npx vitest run --root spikes/crowd-voice
```
