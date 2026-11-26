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
