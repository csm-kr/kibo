# Speaker gate: the customer's voice only (ADR-014)

Plan, stages and adopt/stop criteria: `docs/GOAL.md` "Speaker gate". This folder holds the experiments.

## Stage 0, kill test (2026-11-25): Gemini Embedding 2 does not tell voices apart

Question: does `gemini-embedding-2` on audio encode who is speaking, or what was said? Six order sentences (three
English, three Korean) in eight Gemini TTS voices (`voices.ts`, 48 clips, 16 kHz WAV, speech only), one embedding
per clip (`embed-check.ts`), cosine between every pair.

| Pairs | Mean cosine |
|---|---|
| Same voice, different words | 0.623 |
| Different voices, same words | 0.925 |
| Different voices, different words | 0.622 |

- A clip's nearest neighbour was another voice saying the same words in 48 of 48, the same voice in 0 of 48.
- Same voice scores no higher than a different voice (0.623 against 0.622): the embedding carries the words and no
  sign of the speaker. AUC same voice against same words 0.008.
- One call took 942 ms (median, 48 calls, 4 at a time), 1,636 ms at most: too slow to gate live audio even if it
  worked.
- Verdict: not usable as a speaker embedding. A speaker gate needs a speaker-verification model (not Gemini), or
  Gemini doing the speaker attribution itself on the audio (stage 1, candidate A).

```
npx tsx --env-file=.env spikes/speaker-gate/voices.ts       # writes audio/tts (git-ignored)
npx tsx --env-file=.env spikes/speaker-gate/embed-check.ts  # writes logs/embed-check-*.json
```

## Stage 1, the judge (2026-11-26): a frozen crowd benchmark in `bench/`

One command scores any candidate against the adopt line (`docs/GOAL.md` "Speaker-aware listening"): a layer that
removes music, a loudness gate, a voice gate, a meaning filter, or a stack of them. The judge was built and checked
before any candidate, so every candidate is measured by the same set.

### The set (version 2, manifest sha256 `51967c1a81e89fbfb5f76fa921e0f4d980f57845b704f1a29d66a430a2726292`)

- `bench/build.ts` (seed 20261126) writes 1,320 trials in 98 cells: 960 for the word layer (40 cells x 2 languages x
  12) and 360 for Live (9 cells x 2 languages x 20). Every trial has its own seed, so a later cell does not change the
  others. `--check` rebuilds in memory and compares: v1 (600 trials) and v2 (1,320 trials) each came out byte for
  byte the same (11-26).
- A candidate may read `inputs/<trial>/mix.wav` (16 kHz mono) and `enrol.wav` (about 3 s of the customer, clean, a
  different sentence from the one in the mix, at the customer's normal level, -20 dBFS). It may not read `refs/`
  (`customer.wav`: the customer alone from `customer.startMs`; `ref.json`: texts, speech spans in ms, language, cell,
  levels, bystander clips with times, music offset, overlap, clipped samples). The noise alone is mix minus customer.
- Committed: `manifest.json` (inputs and their sha256), `refs.json` (cells in run order, references and their
  sha256), `sources.json` (sha256 of every source file). Audio is git-ignored. Gemini TTS does not return the same
  bytes twice and the corpora live outside the repo, so the build refuses sources that differ from `sources.json`:
  the set can be rebuilt only from the same files (keep `bench/audio/src/tts/` and the data folder).
- Levels: "level" is the bystanders' speech level relative to the customer's enrolment level, as in run.ts;
  `docs/GOAL.md` writes the same thing as SIR with the sign turned (SIR +5 = bystander at -5 dB).

| Cells (word layer, each language, 12 trials) | What |
|---|---|
| `alone`, `quiet-6`, `quiet-12` | the customer alone, at their enrolment level and 6 or 12 dB under it (TTS 6, real 6) |
| `quiet-6+chat@-15`, `quiet-12+chat@-15` | the quiet customer with small talk 15 dB under the enrolment level |
| `chat@L`, `order@L` for L = -15, -10, -5, 0, +5 | one bystander making small talk / ordering from the same menu (TTS) |
| `read@L`, same levels | real customer and real bystander (public read speech) |
| `babble@-10`, `babble@0` | four bystanders at once (two order, two chat; or four real), their sum at L |
| `song@-10`, `@0`, `@+5` | the project's score plus a TTS voice-over of lyrics-like lines, together at L |
| `music@-10`, `@0`, `@+5`; `music+chat@0` | the project's own score (instrumental); with a bystander |
| `yes@L`, five levels | the customer silent, a bystander says "Yes. Yes, that's right." |
| `silent+chat@0`, `silent+order@0`, `silent+read@0` | the customer silent, one bystander |
| `short`, `short+chat@-10`, `short+chat@0` | the customer's short answer ("Yes.", "That's all."; "네.", "그게 다예요.") |

Live cells (each language, 20 trials, timeline 5 s noise, the hero order, 12 s noise; TTS customers in six voices):
`alone`, `chat@-10`, `chat@0`, `order@-10`, `order@0`, `babble@0` (two TTS, two real), `music@0`, `song@0`, and
`review-yes@0` (run.ts's review: the hero order is in, the confirm card is open, only a bystander says yes).

Voices and sources: customers are Gemini TTS voices (Kore, Leda, Zephyr, Orus, Achird, Sulafat), bystanders other TTS
voices (Puck, Charon, Fenrir, Aoede, Enceladus, Despina), all synthetic (`bench/synth.ts`). Real voices: mini
LibriSpeech dev-clean-2 (English, 26 speakers in the set, https://www.openslr.org/31/, CC BY 4.0) and Zeroth-Korean
test (Korean, 10 speakers, https://www.openslr.org/40/, CC BY 4.0; read from the Hugging Face parquet
`kresnik/zeroth_korean`, whose page states no licence, so the licence is the original's). Real speakers cannot say the
hero order: they are customers and bystanders in the word layer and bystanders in Live babble. Music: only the
project's own scores (`videos/kibo-ad-40s/out/score.wav`, `videos/malo-ad-30s/out/score.wav`).

**Song is a stand-in.** No CC0 or CC BY song with vocals was used. Asked to sing, Gemini TTS read the instruction
aloud ("Sing these lyrics as a slow pop song…", checked by transcribing the four clips on 11-26), so the song cells are
a spoken voice-over of lyrics-like lines over the project's score (the four regenerated clips transcribe as the lines
themselves, rechecked 11-26). Real singing is not covered.

### The contract (any candidate, file based)

For each trial a candidate writes `bench/out/<candidate>/<trial>/meta.json`, and `bench/out/<candidate>/MANIFEST`
holding the manifest sha256 it was made for (the judge refuses another).

- `latency_ms` (required): the delay the method adds (look-ahead plus processing). The judge shifts the candidate's
  audio or text that much later and counts the customer's last word to the AI's first reaction from the real last word.
  It is self-reported; the judge cannot check it.
- `out.wav` (optional): 16 kHz mono on the mix's time base; it may start at `out_offset_ms` and be shorter than the
  mix (the rest is silence). Absent: the mix.
- `segments` (optional): `[[start_ms, end_ms], …]` when the gate is open. The judge sends audio only inside them and
  `audioStreamEnd` at each close (the hold machinery, like run.ts `--ptt-end`); the word layer hears silence outside
  them. Absent: the audio goes continuously and Live's own turn detection ends the turn.
- `text_turns` (optional): `[{at_ms, text}]` for a candidate that gives Live text instead of audio
  (`sendRealtimeInput({text})`); the word layer scores the text as the transcript.
- `input_from` (optional): the candidate whose output this one took, for a stack (for example L0 -> L1 -> L3). The
  judge adds up `latency_ms` along the chain, takes the nearest `out.wav` up the chain, and uses the last candidate's
  `segments` or `text_turns`. A cycle or a missing link is refused.

Baselines through the same contract (`bench/baselines.ts`): `open` (the mix, no segments: production today),
`hold-oracle` (segments = the customer's speech ± 0.2 s: the ceiling of any gate), `customer-oracle` (the clean
customer: the ceiling of extraction), `text-oracle` (the customer's words as text at their last word: the ceiling of a
text candidate). The oracles read `refs/`; a real candidate must not.

### Scoring

- **Word layer** (every word cell): one fixed transcriber, `gemini-3.8-flash`, temperature 0, thinking low, prompt
  pinned in `score.ts` (`TRANSCRIBER`; transcripts cached by audio sha256 in `bench/work/`). Customer words kept: the
  longest common run of the transcript with the customer's text, so a word both people said goes to the customer.
  Bystander words leaked: the transcript's other words matched against all bystanders' words as a bag. Neither: the
  rest. English by words (digits as words); Korean per character without spaces (spacing in transcripts is not
  reliable; a counted digit becomes the native number, 2개 = 두개). Per-character matching lets common syllables
  (요, 고) match by chance, so Korean leak has a floor above zero. Each cell prints pooled kept % and leaked %, and per
  trial k of n with a Wilson 95% interval: trials keeping 90% or more of the customer's words, trials leaking 20% or
  more of the bystanders'.
- **Live layer** (named cells): one Live session per trial, the phone's pinned config, the run.ts send loop.
  Right (run.ts): the AI did nothing before or while the customer spoke, reacted within 5 s of the last word, and the
  cart holds the two cheeseburgers and nothing else. Bystander items added: any `addToCart` or final cart line other
  than the cheeseburger, or more than two. Review: whether the AI called `confirmCheckout` on the bystander's yes, and
  whether the order left `confirming`. Every cell prints k of n with a Wilson 95% interval.
- **Adopt line** (`docs/GOAL.md`): read on `order@0` (a rival order at 0 dB: the only talk that can put items in the
  cart), with `chat@0` printed beside it: right in 18 or more of 20, bystander items in 1 or fewer, the customer alone
  at most one run worse than `open` on the same trials, added delay (median reaction alone minus `open`'s) within
  0.5 s (B, C) or 1.5 s (A). Under 20 runs it prints "not evaluable", never a scaled pass.
- `--runs` defaults to 6 (screening); 20 only for the best stacks on the adopt cells.

```
python3 -m venv ~/kibo-data/speaker-gate/bench-venv && ~/kibo-data/speaker-gate/bench-venv/bin/pip install --only-binary=:all: pyarrow
~/kibo-data/speaker-gate/bench-venv/bin/python -I spikes/speaker-gate/bench/prep_real.py --libri <LibriSpeech/dev-clean-2> \
  --zeroth <zeroth test parquet> --out ~/kibo-data/speaker-gate/data/real
npx tsx --env-file=.env spikes/speaker-gate/bench/synth.ts            # TTS sources (only missing files)
npx tsx spikes/speaker-gate/bench/build.ts --real ~/kibo-data/speaker-gate/data/real [--check]
npx tsx spikes/speaker-gate/bench/baselines.ts
npx tsx --env-file=.env spikes/speaker-gate/bench/score.ts --candidate <name> --layer words|live|all [--runs 6] [--cells en/order@0,...]
npx vitest run --root spikes/speaker-gate/bench                      # the scoring rules
```

Deleted to save disk and regenerated by the commands above: `bench/inputs`, `bench/refs` (build.ts), `bench/out/<baseline>`
(baselines.ts), the transcript cache `bench/work/` (score.ts calls the transcriber again), and the Zeroth parquet
(download `data/test-00000-of-00001.parquet` from the Hugging Face dataset `kresnik/zeroth_korean` and rerun
prep_real.py). `bench/audio/src/tts/` and `~/kibo-data/speaker-gate/data/` are the pinned sources: deleting them makes
the set unbuildable (sources.json). A copy of the 100 TTS clips is kept in `~/kibo-data/speaker-gate/tts-sources-copy/`.

### Validation (2026-11-26): the judge reproduces the known direction

Commit `397cb09e`, src/, data/ and skills/ clean (stamped in every log). Live: 6 runs per cell (screening), Wilson 95%
intervals in brackets; the intervals overlap widely at n = 6, so only large differences mean anything.

Live, right of 6 (logs `bench/logs/live-open.jsonl`, `live-hold-oracle.jsonl`; summaries `live-*-summary.json`):

| Cell | open (production today) | hold-oracle (perfect hold) |
|---|---|---|
| en / ko alone | 5 [44-97%] / 6 [61-100%] | 6 / 6 |
| chat@-10 | 0 [0-39%] / 0 | 6 [61-100%] / 6 |
| chat@0 | 0 / 0 | 4 [30-90%] / 4 |
| order@-10 | 0 / 0 | 6 / 6 |
| order@0 (adopt cell) | 0 / 0 | 4 / 4 (en: bystander items in 2) |
| babble@0 | 0 / 0 | 1 [3-56%] / 3 [19-81%] |
| music@0 | 4 [30-90%] / 5 [44-97%] | 6 / 6 |
| song@0 (voice-over) | 1 / 0 | 6 / 5 |
| review-yes@0: the order went to `paying` on a bystander's yes | 5 [44-97%] / 1 [3-56%] | 0 / 0 (by construction: nothing is sent when the customer is silent) |

- Known (`spikes/crowd-voice/README.md`): open microphone 0 right with bystanders at -20 dB or louder, hold to talk
  right in most runs up to 0 dB, both right in quiet. Reproduced: open 0 of 6 in every chat, order and babble cell
  (down to -10 dB; song@0 1 of 6), hold
  6 of 6 at -10 dB and 4 of 6 at 0 dB, both 5 to 6 of 6 alone. Where hold misses at 0 dB, the bystander's words said
  during the customer's sentence got into the held audio (logs), the overlap that only extraction or meaning can fix.
- Review: on the open microphone the server accepted the AI's `confirmCheckout` on a bystander's "Yes. Yes, that's
  right." and the order went to `paying` in 5 of 6 (en) and 1 of 6 (ko) (the card at the kiosk is still needed to
  pay). run.ts saw the same (2 of 3 at 0 dB, 11-22). One earlier smoke session of this cell, where the AI called
  `confirmCheckout` and the server refused it, was removed from the log before the batch (the "tried" count did not
  exist yet) and the trial was run again; it is the only refused attempt seen.
- Open en alone 5 of 6: the sixth put four cheeseburgers in the cart with nobody else talking; the "items outside the
  hero order" count catches model errors too, not only bystanders. Likewise hold-oracle en chat@0 counted items in 2
  of 6 where the bystander named no menu item: Live misheard the customer under the overlap ("one double, three zero
  cola") or added a double cheeseburger on its own. So the adopt line's "bystander items in 1 or fewer" can fail
  without any bystander order getting through; the rule stays as `docs/GOAL.md` writes it.
- v1 of the judge (600 trials, one bystander alternating order and small talk, logs `bench/logs/v1/`): open 0 of 6 at
  0 dB, hold-oracle 3 of 6 (en) and 2 of 6 (ko), both 6 of 6 alone; same direction.

Word layer (all 80 cells; logs `bench/logs/words-{open,hold-oracle,customer-oracle,text-oracle}-2026-11-26T13-*.json`):

- Calibration: customer-oracle keeps 90 to 100% of the customer's words in every cell with 0 to 1% leaked;
  text-oracle 100% and 0%. So the transcriber and the scoring add little error of their own.
- Open, customer words kept / bystander words leaked, en: chat@-15 99% / 14%, chat@-10 100 / 52, chat@0 95 / 71,
  order@0 95 / 74, order@+5 79 / 90, babble@0 36 / 13, song@0 73 / 30, short+chat@0 72 / 90; customer silent: 95 to
  100% of the bystanders' words come through. Korean is similar (chat@0 99 / 82, order@0 98 / 91, read@0 47 / 39).
- Hold-oracle cuts the leak, not to zero (en chat@0 55%, order@0 58%; customer silent 0%), and keeps about as many
  customer words: the overlap stays.
- A quiet customer alone (6 or 12 dB under the enrolment) is transcribed as well as a normal one (97 to 100%), so any
  loss there in a candidate is the candidate's (the lock-out the loudness gate had).
- Real read speech is harder than TTS at the same level (en read@0 kept 89%, ko read@0 47%, against chat@0 95% and
  99%), and four people at 0 dB (babble) take most of the customer's words even for hold (34% en, 50% ko).

Text path (`text_turns`, text-oracle, Live, log `bench/logs/live-text-oracle.jsonl`): right 6 of 6 en and 6 of 6 ko
alone, median reaction 992 ms and 995 ms from the customer's last word (plus one earlier session, right, 2,502 ms,
outside these 6). Chaining (`input_from`): a two-link test on the word layer (customer-oracle, then a link adding
100 ms) gave customer-oracle's table with no new transcriber calls and 100 ms on every row. `out_offset_ms` is used by
customer-oracle on the word layer; no Live session has used it yet.

Cost and time: 313 Live sessions up to the baseline batch (v1 and v2, both baselines, smoke runs; 11 text-oracle sessions came after), median 25.3 s each. 229 reported
`usageMetadata`: on average 30,751 prompt tokens (mostly the instructions replayed on each turn; audio about 870)
and 230 output tokens per session (all prompt tokens other than audio are priced as text below). Sessions where the turn never ended (open microphone in talk) report no usage, so
what they cost is unknown. At $0.75 per million text input tokens, $3 audio input and $12 audio output (from the
Vertex AI pricing page and a reseller listing; Google's Developer API table not confirmed: unverified), the 229
cost about $6.4, about ₩9,000 at about ₩1,400 per dollar (unverified). Word layer: one transcriber call per noisy
trial, about 2 to 5 minutes per candidate at 6 to 8 at a time; the call price is unverified.

### Limits

- A digital mix: no room, no phone microphone, no echo cancellation, noise suppression or automatic gain.
- Synthetic customers in Live (real speakers cannot say the hero order); real voices only as word-layer customers and
  as bystanders. TTS bystanders say one sentence each, repeated.
- Song is a spoken voice-over over instrumental music, not singing.
- Six runs per cell are a screen: the adopt verdict needs 20 and prints "not evaluable" below that.
- `latency_ms` is self-reported. The word layer depends on one transcriber; Korean leak per character has a floor.
- The review cell measures the AI and the server's confirm rule together; the phone's own tap/hold rule for the
  review (`docs/GOAL.md`) is not in this path.

## Stage 2, loudness and meaning on the judge (2026-11-26 to 11-27)

Asked by kibo-59: L1 (loudness) and L3 (meaning) as candidates on the frozen judge, then Live. The owner made meaning
the main line on 11-26 ("follow the flow of meaning ... speak without pressing"). No trial byte and no scoring rule
of stage 1 changed; every addition below is logged in the rows it affects.

### Judge additions (stage 1 untouched)

- `--cap-won <won>` is required for every scoring run; it refuses to start, and stops before each Live session, once
  the ledger has reached it. The first 402 or 429 (or a Live close whose reason says quota or credit) ends the run
  (exit 3). `bench/spend.ts` rebuilds the ledger from the logs: Live usage per session (`live-*.jsonl`,
  `flow-*.jsonl`, `logs/v1`), text calls with usage (`logs/calls.jsonl`, written by the transcriber and the flow
  filter from 11-27), earlier transcriber calls and TTS clips (estimated), other streams (`logs/spend-other.json`).
  Prices from `evidence/cost-per-order.json` (read 10-13), unverified today; ₩1,400 per dollar unverified.
- `--instructions <file>` appends text to the pinned Live instructions; the file and its sha256 go in every row, and
  the runs go to the stack's own log (`--as`). `--trials <ids or file>` scores a named word-layer slice
  (`words-<cand>-slice-*.json`). The Live summary prints the reaction against hold-oracle in the same cell as an extra
  column; the adopt rule still compares with `open` on `alone` (kibo-59: lead with the frozen rule).
- The flow session, `bench/build-flow.ts` (texts in `flow-sources.ts`, 48 new TTS clips, pinned in
  `sources-flow.json`): 64 trials in their own `manifest-flow.json` (version flow-1, sha256
  `026b37a758ecc06ca00f569c4dcc17f9a9a1655327741e8128987598039b848f`) and `refs-flow.json`, so the stage-1 manifest's
  sha256 that keys every earlier log is unchanged; `--check` rebuilt all 128 files byte for byte. One trial is one
  61.5 s Live session: 3 s of bystanders, then the customer's four turns (the hero order; "Make both fries large";
  "No, thanks"; "That's all. I'll pay."), each 12 s after the one before, then 12 s. Bystanders talk throughout:
  chat (the stage-1 chat clips) or menu talk (a neighbour discussing their own food from the same menu, not said to
  the assistant). Cells chat and menu at -10 and 0 dB, English and Korean, 8 trials each. Runner `bench/flow.ts`:
  stacks open, hold-oracle (customer turns ±0.2 s) and l1-loud (the gate run frame by frame, `asked()` after each
  KIBO reply, held frames sent at once on opening, activity end on each close). Right = hero cart, status confirming
  or paying, no bystander item ever added; also logged: paying without the review's tap, spurious replies, gate closes
  inside a customer sentence, refused voice confirms (from 11-27), and the sha256 of gate.ts and flow.ts and the
  gate settings (from 11-27; the earlier rows ran before the anchor option, with the default path unchanged). Each
  customer turn counts as acted on only by its own action within 5 s of its end (`bench/flowScoring.ts`: the hero
  order an addToCart of cheese_burger, "both fries large" an updateCart), recomputed from the logs by
  `bench/flow-report.ts`. Limit: the customer speaks on a fixed clock, 12 s apart, sometimes into KIBO's playback,
  which half-duplex muting then drops, so "right" in the chat cells is partly a bench effect; items added and payments
  confirmed do not depend on it.

### L1, the loudness gate (`candidates/l1-loud/`, README there has the app contract)

Depth swept on a 96-trial dev slice with the rule written first (`SWEEP.md`): 6 dB won (0.522 against 0.499 to
0.502). The first warm version (level from the enrolment, only rising) cut chat@-10 leaks to the hold-oracle ceiling
(en 15%, ko 7%) but kept 3% and 0% of a customer 12 dB quieter (`words-l1-loud-warm-2026-11-26T14-54-34-160Z.json`).
The fixed rule (level = loudest run of speech in the last 5 s; a lone talker is never gated out; 10 s turn cap) keeps
the quiet customer (quiet-12 en 97%, ko 98%) and the customer alone (95%, 100%), and gives the -10 dB gain back
(chat@-10 leaked en 51%, ko 18%; open 52%, 38%) (`words-l1-loud-warm-2026-11-26T15-15-21-100Z.json`, cold
`words-l1-loud-2026-11-26T15-13-12-408Z.json`). At -5 and 0 dB no variant changes anything. The level-only detector
(main, no model) against Silero VAD (comparison): a few customer words lost under music (music@0 kept 92% against 97%
en, 91% against 100% ko); warm Silero kept more of the English -10 dB gain (31% leaked)
(`words-l1-loud-silero*-2026-11-26T15-17-46-378Z.json`, `...15-20-00-025Z.json`).

### L3, meaning

**Can Live's own transcript feed a text filter?** No, not while bystanders talk: in `logs/live-open.jsonl`, chat@0
had no input transcript in 0 of 6 runs in either language, order@0 in 1 of 6 (en) and 0 of 6 (ko), and no turn ended
in 6 of 6. So `l3-flow-text` was scored on the word layer only, from the judge's batch transcripts of the mix; that
score flatters a design that would need L1 or a second streaming transcriber to run.

**`l3-flow-text` on the word layer** (`words-l3-flow-text-2026-11-26T15-07-06-590Z.json`; gemini-3.8-flash, thinking
low, temperature 0, JSON; fixed state: empty cart, KIBO's opening question). Trials where the customer says order
speech (TTS halves), kept% / leaked%, open then filtered, n = 12 per cell unless noted:

| Cell | English | Korean |
|---|---|---|
| chat@-10 | 100/52 → 100/0 | 100/38 → 100/0 |
| chat@0 | 95/71 → 95/1 | 99/82 → 99/0 |
| yes@0 (leaked) | 100 → 4 | 92 → 10 |
| song@0 (n 6) | 95/22 → 95/0 | 99/16 → 99/0 |
| order@-10 | 99/49 → 58/38 | 100/53 → 92/21 |
| order@0 | 95/74 → 69/40 | 98/91 → 79/31 |
| silent+order@0 (leaked) | 95 → 63 | 90 → 90 |
| alone, quiet-6, quiet-12 (n 6) kept | 100 → 100, 84, 100 | 100 → 100 |

Meaning removes chat, a bystander's yes and lyrics, and cannot remove a rival order from the same menu, where it also
loses customer words (kibo-fd's hypothesis holds). Real-voice customers (book sentences) are kept 0% by design.
Latency: 990 calls, median 3,063 ms, p90 6,546 ms (`logs/calls.jsonl`, kind flow). gemini-3.5-flash-lite (the newest
lite on the key), 30 English calls: thinking minimal median 793 ms (p90 1,997), low 854 ms (p90 1,397); chat@0 leaked
4% and kept 87% (Flash 1% and 95%, n 12), order@0 leaked 49% (Flash 30%, n 6)
(`words-l3-flow-lite-minimal-slice-2026-11-26T15-26-36-863Z.json`, `...-low-slice-...15-26-43-343Z.json`). Short
answers with the right state (hero in the cart, the customer's earlier words, KIBO asking "Is that everything?"):
ko short kept 44% → 100%, en short+chat@0 6% → 61%, ko 28% → 56%, leaks 0 (n 12;
`words-l3-flow-text-asked-slice-2026-11-26T15-26-51-718Z.json`).

**`l3-flow-live` in Live** (`candidates/l3-flow-live/instructions.txt`, appended to the pinned instructions), stacked
on l1-loud with the 10 s cap, flow session, 6 sessions per cell. Right k of 6, English then Korean:

| Cell | open (2 per cell) | hold-oracle | l1-loud + l3-flow-live |
|---|---|---|---|
| chat@-10 | 0/2, 0/2 | 5/6, 3/6 | 4/6, 4/6 |
| chat@0 | 0/2, 0/2 | 2/6, 2/6 | 2/6, 1/6 |
| menu@-10 | 0/2, 1/2 | 5/6, 6/6 | 1/6, 0/6 |
| menu@0 | 0/2, 0/2 | 1/6, 1/6 | 0/6, 0/6 |

Logs: `logs/flow-open.jsonl`, `logs/flow-hold-oracle.jsonl`, `logs/flow-l1-loud+l3-flow-live.jsonl` and their
summaries. Bystander items in the no-press stack: 5 or 6 of 6 in every menu cell (chicken wrap 18 times, spicy wings
17, iced tea 14 in 48 sessions); spurious replies 1.3 to 2.7 per session (hold-oracle 0 to 0.3); 12.8 activity ends
per session (hold-oracle 4); 299 frames dropped per session by half-duplex muting while KIBO answered someone
(hold-oracle 7); 15 gate closes inside a customer sentence in 48 sessions. Turns acted on by their own action:
hero 43 and fries 35 of 48 under hold-oracle, 31 and 16 of 48 in the no-press stack, 5 and 1 of 16 open. Delay from
the last customer word to that turn's own action: hold-oracle median 1,144 ms (p90 1,327, n 85), l1 + flow-live
1,329 ms (p90 3,092, n 63) (`bench/flow-report.ts`). Between the customer's turns the neighbour is the lone talker,
the gate opens for them, and in this stack the flow instruction did not prevent Live from acting on their menu talk;
whether it helps on its own is not known (the gate is a confounder; the ablation was not run).

**The picked gate, tap-only review** (11-27; `logs/flow-l1-pick+l3-flow-live-taponly.jsonl`): `loudGate(PICK)`
(first-turn anchor, depth 6, no question lowering, hang-over 1.0 s, cap 10 s; chosen offline by
`candidates/l1-loud/screen.ts`) + l3-flow-live, `CONFIRM_TAP_ONLY=1`, -10 dB cells only, 6 sessions per cell; rows
carry gate.ts sha 29263222…, flow.ts 1e36f410…, instruction d728043f…. Right k of 6, en chat, en menu, ko chat, ko
menu: hold-oracle 5, 5, 3, 6 (19/24); first no-press 4, 1, 4, 0 (9/24); the pick 5, 3, 3, 4 (15/24). Sessions with a
bystander item: 1, 11 and 2 of 24. Hero and fries turns acted on by their own action: 24 and 23, 22 and 12, 22 and
22. Spurious replies per session 0 to 0.3, 1.3 to 2.7, 0.3 to 1.5 (ko chat). Activity ends per session 4, 12.7 to
15.0, 5.5 to 7.0. Gate closes inside a customer sentence 0, 10, 0. Frames dropped per session 2, 370, 74. Delay to the
turn's own action, median (p90): 1,140 (1,288), 1,318 (1,973), 1,285 (2,009) ms. Three of the pick's 7 wrong carts are
the hero order with "both fries large" read as a large set (hold-oracle 1 of 5), a reading problem, not a gate one.
Voice confirms refused by the tap-only rule: 4, three right after the customer's own "That's all. I'll pay." and one
(f0032 ko menu@-10, 60.0 s, on "는") with no customer turn in the 6 s before, at the session's end. Paying without the
tap: 0 of 24.

**Safety.** The runner sends tool calls through the app's own code (`src/lib/voice/toolRunner` → `runCommand` →
`machine.ts` `isConfirmed`), with `utteranceSeq` from the app's `turnsReducer`, so the bench's confirm rule is the
app's. With an open microphone the "fresh user utterance" that rule needs is anyone's: in the no-press stack
confirmCheckout succeeded right after bystander speech in 4 sessions: f0045 en chat@-10 ("told him we should take the
later train"), f0040 ko chat@0 ("아까 회의 진짜 길었지"), f0006 ko menu@-10 ("네. 나는 새우버거랑 레모네이드 할래"),
and f0004 ko chat@-10 (the fragment "매일", 39.5 s, after Live had called requestCheckout on the customer's "No,
thanks"). Three of the four came at 61 to 64 s, when the session ended and the runner closed the last gate segment,
so partly an end-of-run effect; f0004 came mid-session. Under hold-oracle 29 of 48 sessions reached paying by voice,
nearly all on the customer's own "I'll pay". Any no-press build needs the review confirmed by tap only
(`CONFIRM_TAP_ONLY=1`).

Spend: ledger about ₩40,152 for the whole run after these sessions, with the ticket-kiosk and first-hello streams
(`logs/spend.json`, `logs/spend-other.json`); flow sessions cost about ₩145 (hold-oracle) and ₩162 (l1 + flow-live)
each, about ₩36 for open, whose turns never end. (An earlier ₩39,700 priced sessions without usage at one global
mean; each log file now gets its own.) The picked-gate batch cost ₩3,744 (₩156 a session); the ledger is about
₩45,491 after it, over the ₩45,000 line, with about ₩1,655 of kibo-fd's c-voxlock transcriptions in the same window. Not run: hold-oracle + l3-flow-live (the
ablation that would show whether the instruction helps when the turns are perfect), l1-loud alone on the flow set,
and the 20-run adopt phase.
